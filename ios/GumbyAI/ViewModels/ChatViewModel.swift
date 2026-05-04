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
    @Published var streamingImageURLs: [String] = []
    @Published var streamingStatus: String?
    @Published var currentMode: ChatMode = .captions
    @Published var imageAspect: ImageAspect = .post
    @Published var conversationId: String?
    @Published var conversationTitle: String?
    @Published var errorMessage: String?
    @Published var isLoading = false
    @Published var isUploadingImages = false
    @Published var canRetry = false
    @Published var attachedAssetURL: String?
    @Published var localImagesByMessageId: [String: [UIImage]] = [:]

    private let sseService = SSEService.shared
    private let apiService = APIService.shared
    private let uploadService = ImageUploadService.shared

    private var retryText = ""
    private var retryImages: [UIImage] = []
    private var retryImageUrls: [String] = []
    private var retryAssetURL: String?
    private var retryUploadNeeded = false
    private var retryUserMessageId: String?

    func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !selectedImages.isEmpty else { return }

        let composedContent = text

        let messageId = UUID().uuidString
        let userMessage = Message(
            id: messageId,
            conversationID: conversationId ?? "",
            role: .user,
            content: composedContent,
            imageURLs: nil,
            createdAt: Date()
        )
        messages.append(userMessage)

        if !selectedImages.isEmpty {
            localImagesByMessageId[messageId] = selectedImages
        }

        if conversationId == nil && (conversationTitle ?? "").isEmpty {
            if !text.isEmpty {
                conversationTitle = String(text.prefix(50))
            } else if !selectedImages.isEmpty {
                conversationTitle = "Image conversation"
            }
        }

        let currentText = composedContent
        let currentImages = selectedImages
        let currentAssetURL = attachedAssetURL

        inputText = ""
        selectedImages = []
        selectedPhotoItems = []
        attachedAssetURL = nil
        errorMessage = nil
        canRetry = false
        isStreaming = true
        streamingText = ""
        streamingImageURLs = []
        streamingStatus = nil

        retryText = currentText
        retryImages = currentImages
        retryAssetURL = currentAssetURL
        retryUploadNeeded = !currentImages.isEmpty
        retryImageUrls = []
        retryUserMessageId = messageId

        Task {
            var imageUrls: [String] = []

            if let assetURL = currentAssetURL {
                imageUrls.append(assetURL)
            }

            if !currentImages.isEmpty {
                isUploadingImages = true
                do {
                    let urls = try await uploadService.uploadImages(currentImages)
                    imageUrls.append(contentsOf: urls)
                } catch {
                    isUploadingImages = false
                    errorMessage = "Failed to upload images: \(error.localizedDescription)"
                    canRetry = true
                    isStreaming = false
                    return
                }
                isUploadingImages = false

                if let idx = messages.firstIndex(where: { $0.id == messageId }) {
                    messages[idx] = Message(
                        id: messageId,
                        conversationID: conversationId ?? "",
                        role: .user,
                        content: composedContent,
                        imageURLs: imageUrls,
                        createdAt: messages[idx].createdAt
                    )
                    localImagesByMessageId.removeValue(forKey: messageId)
                }
            }

            retryImageUrls = imageUrls
            retryUploadNeeded = false

            startStreaming(text: currentText, imageUrls: imageUrls)
        }
    }

    func retryLastMessage() {
        errorMessage = nil
        canRetry = false
        isStreaming = true
        streamingText = ""
        streamingImageURLs = []
        streamingStatus = nil

        if retryUploadNeeded && !retryImages.isEmpty {
            Task {
                isUploadingImages = true
                do {
                    let urls = try await uploadService.uploadImages(retryImages)
                    retryImageUrls.append(contentsOf: urls)
                    retryUploadNeeded = false

                    if let msgId = retryUserMessageId,
                       let idx = messages.firstIndex(where: { $0.id == msgId }) {
                        messages[idx] = Message(
                            id: msgId,
                            conversationID: conversationId ?? "",
                            role: .user,
                            content: retryText,
                            imageURLs: retryImageUrls,
                            createdAt: messages[idx].createdAt
                        )
                        localImagesByMessageId.removeValue(forKey: msgId)
                    }
                } catch {
                    isUploadingImages = false
                    errorMessage = "Failed to upload images: \(error.localizedDescription)"
                    canRetry = true
                    isStreaming = false
                    return
                }
                isUploadingImages = false
                startStreaming(text: retryText, imageUrls: retryImageUrls)
            }
        } else {
            startStreaming(text: retryText, imageUrls: retryImageUrls)
        }
    }

    private func startStreaming(text: String, imageUrls: [String]) {
        sseService.streamChat(
            conversationId: conversationId,
            message: text,
            imageUrls: imageUrls,
            mode: currentMode.apiValue,
            aspectRatio: imageAspect.apiValue,
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
                    self?.canRetry = true
                    self?.isStreaming = false
                }
            }
        )
    }

    private var pendingQuestions: (id: String, payload: QuestionsPayload)?

    private func handleSSEEvent(_ event: SSEEvent) {
        switch event.type {
        case "start":
            if let convId = event.conversationId {
                conversationId = convId
            }
        case "chunk":
            if let text = event.text {
                streamingStatus = nil
                streamingText += text
            }
        case "image_status":
            streamingStatus = event.text
        case "image":
            if let url = event.imageURL, !url.isEmpty {
                streamingStatus = nil
                streamingImageURLs.append(url)
            }
        case "questions":
            if let payload = event.questionsPayload {
                pendingQuestions = (event.messageId ?? UUID().uuidString, payload)
            }
        case "done":
            if let pending = pendingQuestions {
                let payloadJSON = (try? JSONEncoder().encode(pending.payload))
                    .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                let storedContent = Message.questionsMarker + payloadJSON
                let assistantMessage = Message(
                    id: pending.id,
                    conversationID: conversationId ?? "",
                    role: .assistant,
                    content: storedContent,
                    imageURLs: nil,
                    createdAt: Date()
                )
                messages.append(assistantMessage)
                pendingQuestions = nil
            } else {
                let assistantMessage = Message(
                    id: event.messageId ?? UUID().uuidString,
                    conversationID: conversationId ?? "",
                    role: .assistant,
                    content: streamingText,
                    imageURLs: streamingImageURLs.isEmpty ? nil : streamingImageURLs,
                    createdAt: Date()
                )
                messages.append(assistantMessage)
                GeneratedImagesStore.shared.recordAssistantImageURLs(
                    assistantMessage.imageURLs,
                    createdAt: assistantMessage.createdAt ?? Date()
                )
            }
            streamingText = ""
            streamingImageURLs = []
            streamingStatus = nil
            isStreaming = false
            canRetry = false
        case "error":
            errorMessage = event.error ?? "Something went wrong"
            canRetry = true
            isStreaming = false
        default:
            break
        }
    }

    /// User answered a clarifying-questions card. Persist preferences, build a summary message, and continue.
    func submitQuestionAnswers(
        for questionsMessageId: String,
        payload: QuestionsPayload,
        answers: [String: [String]]
    ) {
        var lines: [String] = ["Here are my answers:"]
        var prefItems: [[String: String]] = []
        for question in payload.questions {
            let picks = answers[question.id] ?? []
            let value = picks.isEmpty ? "(skipped)" : picks.joined(separator: ", ")
            lines.append("• \(question.prompt) — \(value)")
            if !picks.isEmpty {
                prefItems.append(["question": question.prompt, "answer": value])
            }
        }
        let summary = lines.joined(separator: "\n")

        // Persist preferences (fire-and-forget); the backend also extracts answers
        // from the upcoming user message for redundancy.
        if !prefItems.isEmpty {
            let itemsToSave = prefItems
            Task { @MainActor in
                let _: APIResponse<PreferencesData>? = try? await APIService.shared.post(
                    path: "/user/preferences",
                    body: ["answers": itemsToSave]
                )
            }
        }

        inputText = summary
        sendMessage()
    }
}

struct PreferencesData: Codable {
    let items: [PreferenceItem]?
}

struct PreferenceItem: Codable {
    let question: String
    let answer: String
}

extension ChatViewModel {

    private func finishStreaming() {
        if isStreaming && (!streamingText.isEmpty || !streamingImageURLs.isEmpty) {
            let assistantMessage = Message(
                id: UUID().uuidString,
                conversationID: conversationId ?? "",
                role: .assistant,
                content: streamingText,
                imageURLs: streamingImageURLs.isEmpty ? nil : streamingImageURLs,
                createdAt: Date()
            )
            messages.append(assistantMessage)
            GeneratedImagesStore.shared.recordAssistantImageURLs(
                assistantMessage.imageURLs,
                createdAt: assistantMessage.createdAt ?? Date()
            )
            streamingText = ""
            streamingImageURLs = []
        }
        streamingStatus = nil
        isStreaming = false
    }

    func loadConversation(_ id: String, title: String? = nil) async {
        isLoading = true
        conversationId = id
        if let title { conversationTitle = title }

        do {
            let response: APIResponse<[Message]> = try await apiService.get(path: "/chat/\(id)/messages")
            if let msgs = response.data {
                messages = msgs
                GeneratedImagesStore.shared.ingestMessages(msgs)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func newConversation() {
        messages = []
        conversationId = nil
        conversationTitle = nil
        inputText = ""
        selectedImages = []
        selectedPhotoItems = []
        streamingText = ""
        isStreaming = false
        isUploadingImages = false
        errorMessage = nil
        canRetry = false
        attachedAssetURL = nil
        localImagesByMessageId = [:]
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
        isUploadingImages = false
        streamingStatus = nil
        if !streamingText.isEmpty || !streamingImageURLs.isEmpty {
            let assistantMessage = Message(
                id: UUID().uuidString,
                conversationID: conversationId ?? "",
                role: .assistant,
                content: streamingText,
                imageURLs: streamingImageURLs.isEmpty ? nil : streamingImageURLs,
                createdAt: Date()
            )
            messages.append(assistantMessage)
            GeneratedImagesStore.shared.recordAssistantImageURLs(
                assistantMessage.imageURLs,
                createdAt: assistantMessage.createdAt ?? Date()
            )
            streamingText = ""
            streamingImageURLs = []
        }
    }
}
