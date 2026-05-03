import SwiftUI
import PhotosUI

struct ChatView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @State private var showLibrary = false
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 0) {
                chatHeader
                
                if chatVM.messages.isEmpty && !chatVM.isStreaming {
                    emptyState
                } else {
                    messageList
                }
                
                inputBar
            }
        }
        .sheet(isPresented: $showLibrary) {
            LibrarySheetView()
        }
    }
    
    private var chatHeader: some View {
        HStack {
            Button(action: { sidebarVM.toggle() }) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }
            
            Spacer()
            
            Text("Gumby AI")
                .font(.headline)
                .foregroundColor(AppConstants.textPrimary)
            
            Spacer()
            
            Button(action: { chatVM.newConversation() }) {
                Image(systemName: "square.and.pencil")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Text("GUMBY")
                .font(.system(size: 36, weight: .black))
                .foregroundStyle(AppConstants.accentGradient)
            
            Text("What's on your mind?")
                .font(.title3)
                .foregroundColor(AppConstants.textSecondary)
            
            HStack(spacing: 12) {
                ForEach(ChatMode.allCases, id: \.self) { mode in
                    SuggestionChip(title: mode.rawValue, isSelected: chatVM.currentMode == mode) {
                        chatVM.currentMode = mode
                    }
                }
            }
            
            Spacer()
        }
    }
    
    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(chatVM.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }
                    
                    if chatVM.isStreaming && !chatVM.streamingText.isEmpty {
                        StreamingBubble(text: chatVM.streamingText)
                            .id("streaming")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .onChange(of: chatVM.messages.count) { _, _ in
                withAnimation {
                    proxy.scrollTo(chatVM.messages.last?.id ?? "streaming", anchor: .bottom)
                }
            }
            .onChange(of: chatVM.streamingText) { _, _ in
                withAnimation {
                    proxy.scrollTo("streaming", anchor: .bottom)
                }
            }
        }
    }
    
    private var inputBar: some View {
        VStack(spacing: 0) {
            if !chatVM.selectedImages.isEmpty || chatVM.attachedAssetURL != nil {
                attachmentPreview
            }
            
            Divider()
                .background(AppConstants.textSecondary.opacity(0.3))
            
            HStack(alignment: .bottom, spacing: 12) {
                modeSelector
                
                HStack(alignment: .bottom, spacing: 8) {
                    PhotosPicker(selection: $chatVM.selectedPhotoItems,
                                 maxSelectionCount: 5,
                                 matching: .images) {
                        Image(systemName: "photo")
                            .font(.title3)
                            .foregroundColor(AppConstants.textSecondary)
                    }
                    .onChange(of: chatVM.selectedPhotoItems) { _, _ in
                        Task { await chatVM.loadSelectedPhotos() }
                    }
                    
                    Button(action: { showLibrary = true }) {
                        Image(systemName: "folder")
                            .font(.title3)
                            .foregroundColor(AppConstants.textSecondary)
                    }
                    
                    TextField("What's on your mind?", text: $chatVM.inputText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .foregroundColor(AppConstants.textPrimary)
                        .lineLimit(1...5)
                    
                    if chatVM.isStreaming {
                        Button(action: { chatVM.cancelStreaming() }) {
                            Image(systemName: "stop.circle.fill")
                                .font(.title2)
                                .foregroundColor(.red)
                        }
                    } else {
                        Button(action: { chatVM.sendMessage() }) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundStyle(AppConstants.accentGradient)
                        }
                        .disabled(chatVM.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && chatVM.selectedImages.isEmpty)
                    }
                }
                .padding(12)
                .background(AppConstants.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 24))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
        }
    }
    
    private var modeSelector: some View {
        Menu {
            ForEach(ChatMode.allCases, id: \.self) { mode in
                Button(action: { chatVM.currentMode = mode }) {
                    Label(mode.rawValue, systemImage: chatVM.currentMode == mode ? "checkmark" : "")
                }
            }
        } label: {
            Text(chatVM.currentMode.rawValue)
                .font(.caption)
                .fontWeight(.semibold)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(AppConstants.surfaceColor)
                .foregroundColor(AppConstants.textPrimary)
                .clipShape(Capsule())
        }
    }
    
    private var attachmentPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(chatVM.selectedImages.enumerated()), id: \.offset) { index, image in
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 60, height: 60)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        
                        Button(action: { chatVM.removeImage(at: index) }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.caption)
                                .foregroundColor(.white)
                                .background(Circle().fill(.black.opacity(0.6)))
                        }
                        .offset(x: 4, y: -4)
                    }
                }
                
                if let assetURL = chatVM.attachedAssetURL {
                    ZStack(alignment: .topTrailing) {
                        AsyncImage(url: URL(string: assetURL)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            ProgressView()
                        }
                        .frame(width: 60, height: 60)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        
                        Button(action: { chatVM.attachedAssetURL = nil }) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.caption)
                                .foregroundColor(.white)
                                .background(Circle().fill(.black.opacity(0.6)))
                        }
                        .offset(x: 4, y: -4)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }
}

#Preview {
    ChatView()
        .environmentObject(ChatViewModel())
        .environmentObject(SidebarViewModel())
        .environmentObject(LibraryViewModel())
}
