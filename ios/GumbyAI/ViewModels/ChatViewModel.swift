import SwiftUI
import PhotosUI
import UIKit

@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var inputText = ""
    @Published var selectedImages: [UIImage] = []
    @Published var selectedPhotoItems: [PhotosPickerItem] = []
    @Published var isStreaming = false
    @Published var streamingText = ""
    @Published var currentMode: ChatMode = .captions
    @Published var conversationId: String?
    @Published var errorMessage: String?
    @Published var isLoading = false
    @Published var attachedAssetURL: String?
    
    private let sseService = SSEService.shared
    private let apiService = APIService.shared
    private let uploadService = ImageUploadService.shared
    
    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !selectedImages.isEmpty else { return }
        
        let userMessage = Message(
            id: UUID().uuidString,
            conversationID: conversationId ?? "",
            role: .user,
            content: text,
            imageURLs: nil,
            createdAt: Date()
        )
        messages.append(userMessage)
        
        let currentText = text
        let currentImages = selectedImages
        let currentAssetURL = attachedAssetURL
        
        inputText = ""
        selectedImages = []
        selectedPhotoItems = []
        attachedAssetURL = nil
        isStreaming = true
        streamingText = ""
        
        Task {
            var imageUrls: [String] = []
            
            if let assetURL = currentAssetURL {
                imageUrls.append(assetURL)
            }
            
            if !currentImages.isEmpty {
                do {
                    let urls = try await uploadService.uploadImages(currentImages)
                    imageUrls.append(contentsOf: urls)
                } catch {
                    errorMessage = "Failed to upload images: \(error.localizedDescription)"
                    isStreaming = false
                    return
                }
            }

            sseService.streamChat(
                conversationId: conversationId,
                message: currentText,
                imageUrls: imageUrls,
                mode: currentMode.rawValue.lowercased(),
                onEvent: { [weak self] event in
                    Task { @MainActor in
                        self?.handleSSEEvent(event)
                    }
                },
                onComplete: { [weak self] in
                    Task { @MainActor in
                        self?.finishStreaming()
                    }
                },
                onError: { [weak self] error in
                    Task { @MainActor in
                        self?.errorMessage = error.localizedDescription
                        self?.isStreaming = false
                    }
                }
            )
        }
    }
    
    private func handleSSEEvent(_ event: SSEEvent) {
        switch event.type {
        case "start":
            if let convId = event.conversationId {
                conversationId = convId
            }
        case "chunk":
            if let text = event.text {
                streamingText += text
            }
        case "done":
            let assistantMessage = Message(
                id: event.messageId ?? UUID().uuidString,
                conversationID: conversationId ?? "",
                role: .assistant,
                content: streamingText,
                imageURLs: nil,
                createdAt: Date()
            )
            messages.append(assistantMessage)
            streamingText = ""
            isStreaming = false
        case "error":
            errorMessage = event.error ?? "Unknown error"
            isStreaming = false
        default:
            break
        }
    }
    
    private func finishStreaming() {
        if isStreaming && !streamingText.isEmpty {
            let assistantMessage = Message(
                id: UUID().uuidString,
                conversationID: conversationId ?? "",
                role: .assistant,
                content: streamingText,
                imageURLs: nil,
                createdAt: Date()
            )
            messages.append(assistantMessage)
            streamingText = ""
        }
        isStreaming = false
    }
    
    func loadConversation(_ id: String) async {
        isLoading = true
        conversationId = id
        
        do {
            let response: APIResponse<[Message]> = try await apiService.get(path: "/chat/\(id)/messages")
            if let msgs = response.data {
                messages = msgs
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func newConversation() {
        messages = []
        conversationId = nil
        inputText = ""
        selectedImages = []
        streamingText = ""
        isStreaming = false
        errorMessage = nil
        attachedAssetURL = nil
    }
    
    func attachAsset(url: String) {
        attachedAssetURL = url
    }
    
    func loadSelectedPhotos() async {
        selectedImages = []
        for item in selectedPhotoItems {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                selectedImages.append(image)
            }
        }
    }
    
    func removeImage(at index: Int) {
        guard index < selectedImages.count else { return }
        selectedImages.remove(at: index)
        if index < selectedPhotoItems.count {
            selectedPhotoItems.remove(at: index)
        }
    }
    
    func cancelStreaming() {
        sseService.cancel()
        isStreaming = false
        if !streamingText.isEmpty {
            let assistantMessage = Message(
                id: UUID().uuidString,
                conversationID: conversationId ?? "",
                role: .assistant,
                content: streamingText,
                imageURLs: nil,
                createdAt: Date()
            )
            messages.append(assistantMessage)
            streamingText = ""
        }
    }
}
