import SwiftUI
import PhotosUI

struct ChatView: View {
    private static let dividerDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "d MMM 'at' h:mm a"
        return f
    }()

    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService
    @State private var showLibrary = false

    private let landingPlaceholder = "Ask Gumby to create a presentation about..."
    private let conversationPlaceholder = "Ask Gumby..."

    private let composerSuggestions: [String] = [
        "Create a landing page",
        "Plan a weekly content calendar",
        "Brainstorm reel ideas",
        "Write captions for Instagram"
    ]

    private var useLandingChrome: Bool {
        chatVM.messages.isEmpty && !chatVM.isStreaming
    }

    private var canSend: Bool {
        !chatVM.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !chatVM.selectedImages.isEmpty
    }

    private var userFirstName: String {
        authService.currentUser?.name.split(separator: " ").first.map(String.init) ?? "there"
    }

    var body: some View {
        ZStack {
            if useLandingChrome {
                chatLandingBackdrop.ignoresSafeArea()
            } else {
                AppConstants.chatCanvasBlack.ignoresSafeArea()
            }

            VStack(spacing: 0) {
                chatHeader

                if useLandingChrome {
                    landingMain
                } else {
                    messageList
                }

                composerSection
            }
        }
        .sheet(isPresented: $showLibrary) {
            LibrarySheetView()
        }
    }

    // MARK: - Landing backdrop

    private var chatLandingBackdrop: some View {
        ZStack {
            Color.black
            GeometryReader { g in
                let w = g.size.width
                let h = g.size.height
                ZStack {
                    Ellipse()
                        .fill(Color(red: 0.12, green: 0.32, blue: 0.92))
                        .frame(width: w * 1.25, height: h * 0.55)
                        .blur(radius: 72)
                        .offset(y: h * 0.34)

                    Ellipse()
                        .fill(Color(red: 0.93, green: 0.18, blue: 0.55))
                        .frame(width: w * 1.15, height: h * 0.52)
                        .blur(radius: 68)
                        .offset(x: w * 0.12, y: h * 0.41)

                    Ellipse()
                        .fill(Color(red: 1, green: 0.43, blue: 0.12))
                        .frame(width: w * 1.05, height: h * 0.48)
                        .blur(radius: 60)
                        .offset(x: -w * 0.14, y: h * 0.5)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    // MARK: - Header

    private var chatHeader: some View {
        ZStack {
            HStack {
                headerCircleButton(icon: "line.3.horizontal") {
                    sidebarVM.toggle()
                }
                Spacer()
                if !useLandingChrome {
                    headerCircleButton(icon: "play.fill", size: 14) {}
                }
            }

            Group {
                if useLandingChrome {
                    gumbyWordmarkCentered
                } else {
                    centerModeCapsuleMenu
                }
            }
            .allowsHitTesting(true)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private var gumbyWordmarkCentered: some View {
        HStack(spacing: 8) {
            Image(systemName: "heart.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AppConstants.accentGradient)
            Text("Gumby")
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(AppConstants.textPrimary)
        }
    }

    private var centerModeCapsuleMenu: some View {
        Menu {
            modePickerButtons
            Divider()
            Button {
                showLibrary = true
            } label: {
                Label("Library", systemImage: "folder")
            }
            Divider()
            Button(role: .none) {
                chatVM.newConversation()
            } label: {
                Label("New conversation", systemImage: "square.and.pencil")
            }
        } label: {
            HStack(spacing: 6) {
                Text(chatVM.currentMode.rawValue)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(AppConstants.textPrimary)
            .frame(maxWidth: 220)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(AppConstants.chatComposerInner.opacity(0.95))
            .clipShape(Capsule())
        }
    }

    private func headerCircleButton(icon: String, size: CGFloat = 17, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(AppConstants.textPrimary)
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.1))
                .clipShape(Circle())
        }
    }

    private var landingMain: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 28)

            Text("What's on your mind, \(userFirstName)?")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AppConstants.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer(minLength: 44)
        }
    }

    // MARK: - Composer (bottom stack)

    private var composerSection: some View {
        VStack(spacing: 0) {
            if !chatVM.selectedImages.isEmpty || chatVM.attachedAssetURL != nil {
                attachmentPreview
            }

            if !useLandingChrome {
                suggestionChipsRow
                    .padding(.bottom, 10)
            }

            if useLandingChrome {
                landingComposer
            } else {
                conversationComposer
            }
        }
        .padding(.bottom, 8)
        .background(useLandingChrome ? Color.clear : AppConstants.chatCanvasBlack)
    }

    private var suggestionChipsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(composerSuggestions, id: \.self) { title in
                    Button {
                        chatVM.inputText = title
                    } label: {
                        Text(title)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(AppConstants.textPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(AppConstants.chatComposerSurface.opacity(0.95))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var landingComposer: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("", text: $chatVM.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 17))
                .foregroundStyle(AppConstants.textPrimary)
                .lineLimit(2...8)
                .overlay(alignment: .leading) {
                    if chatVM.inputText.isEmpty {
                        Text(landingPlaceholder)
                            .font(.system(size: 16))
                            .foregroundStyle(AppConstants.chatPlaceholder)
                            .allowsHitTesting(false)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

            landingComposerToolbar
        }
        .padding(.horizontal, 22)
        .padding(.top, 20)
        .padding(.bottom, 18)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(AppConstants.chatComposerSurface.opacity(0.82))
                .background(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
    }

    private var landingComposerToolbar: some View {
        HStack(spacing: 14) {
            PhotosPicker(
                selection: $chatVM.selectedPhotoItems,
                maxSelectionCount: 5,
                matching: .images
            ) {
                circleToolbarIcon(systemName: "plus")
                    .foregroundStyle(AppConstants.chatPlaceholder)
            }
            .onChange(of: chatVM.selectedPhotoItems) { _, _ in
                Task { await chatVM.loadSelectedPhotos() }
            }

            Spacer(minLength: 4)

            buildModeCapsuleMenu

            Image(systemName: "mic.fill")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(AppConstants.chatPlaceholder)
                .frame(width: 28, height: 28)

            sendCircleButton
        }
    }

    private var conversationComposer: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("", text: $chatVM.inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 17))
                .foregroundStyle(AppConstants.textPrimary)
                .lineLimit(2...8)
                .overlay(alignment: .leading) {
                    if chatVM.inputText.isEmpty {
                        Text(conversationPlaceholder)
                            .font(.system(size: 16))
                            .foregroundStyle(AppConstants.chatPlaceholder)
                            .allowsHitTesting(false)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

            conversationComposerToolbar
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 14)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AppConstants.chatComposerInner)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .padding(.horizontal, 16)
    }

    private var conversationComposerToolbar: some View {
        HStack(spacing: 16) {
            PhotosPicker(
                selection: $chatVM.selectedPhotoItems,
                maxSelectionCount: 5,
                matching: .images
            ) {
                circleToolbarIcon(systemName: "plus")
                    .foregroundStyle(AppConstants.chatMutedLabel)
            }
            .onChange(of: chatVM.selectedPhotoItems) { _, _ in
                Task { await chatVM.loadSelectedPhotos() }
            }

            Menu {
                Button {
                    showLibrary = true
                } label: {
                    Label("Library", systemImage: "folder")
                }
            } label: {
                circleToolbarIcon(systemName: "ellipsis")
                    .foregroundStyle(AppConstants.chatMutedLabel)
            }

            Button(action: {}) {
                circleToolbarIcon(systemName: "rectangle.split.2x1")
                    .foregroundStyle(AppConstants.chatMutedLabel)
            }

            Image(systemName: "mic.fill")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(AppConstants.chatMutedLabel)
                .frame(width: 28, height: 28)

            Spacer(minLength: 0)

            sendCircleButton
        }
    }

    private func circleToolbarIcon(systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .medium))
            .frame(width: 38, height: 38)
    }

    @ViewBuilder
    private var sendCircleButton: some View {
        if chatVM.isStreaming {
            Button(action: { chatVM.cancelStreaming() }) {
                Image(systemName: "stop.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.red)
                    .frame(width: 42, height: 42)
            }
        } else {
            Button(action: { chatVM.sendMessage() }) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(canSend ? AppConstants.textPrimary : Color.white.opacity(0.35))
                    .frame(width: 42, height: 42)
                    .background(
                        Circle()
                            .fill(AppConstants.chatSendCircle.opacity(canSend ? 1 : 0.45))
                    )
            }
            .disabled(!canSend)
        }
    }

    private var buildModeCapsuleMenu: some View {
        Menu {
            modePickerButtons
            Divider()
            Button {
                showLibrary = true
            } label: {
                Label("Library", systemImage: "folder")
            }
        } label: {
            HStack(spacing: 5) {
                Text(chatVM.currentMode.rawValue)
                    .font(.system(size: 14, weight: .medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(AppConstants.chatPlaceholder)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    @ViewBuilder
    private var modePickerButtons: some View {
        ForEach(ChatMode.allCases, id: \.self) { mode in
            Button {
                chatVM.currentMode = mode
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(mode.rawValue)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(AppConstants.textPrimary)
                        Spacer(minLength: 8)
                        if chatVM.currentMode == mode {
                            Image(systemName: "checkmark")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(AppConstants.textPrimary)
                        }
                    }
                    Text(Self.modeMenuSubtitle(mode))
                        .font(.system(size: 12))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private static func modeMenuSubtitle(_ mode: ChatMode) -> String {
        switch mode {
        case .captions:
            return "Craft strong captions & hashtags fast."
        case .ideas:
            return "Discuss before building concrete plans."
        case .build:
            return "Make changes directly across your content."
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    ForEach(chatVM.messages) { message in
                        if let cap = boundaryTimestamp(for: message) {
                            Text(cap)
                                .font(.system(size: 12))
                                .foregroundStyle(AppConstants.chatMutedLabel)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 4)
                        }

                        MessageBubble(
                            message: message,
                            localImages: chatVM.localImagesByMessageId[message.id],
                            onAnswerQuestions: { msgId, payload, answers in
                                chatVM.submitQuestionAnswers(
                                    for: msgId,
                                    payload: payload,
                                    answers: answers
                                )
                            },
                            onSkipQuestions: { _ in
                                chatVM.inputText =
                                    "Skip the questions, just go ahead and build it with reasonable defaults."
                                chatVM.sendMessage()
                            }
                        )
                        .id(message.id)
                    }

                    if chatVM.isUploadingImages {
                        UploadingIndicator()
                            .id("uploading")
                    }

                    if chatVM.isStreaming && !chatVM.isUploadingImages {
                        StreamingBubble(text: chatVM.streamingText)
                            .id("streamingRow")
                    }

                    if let error = chatVM.errorMessage {
                        ErrorBubble(
                            message: error,
                            canRetry: chatVM.canRetry,
                            onRetry: { chatVM.retryLastMessage() }
                        )
                        .id("error")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .padding(.bottom, 6)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chatVM.messages.count) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: chatVM.isStreaming) { _, streaming in
                if streaming { scrollToBottom(proxy, animated: false) }
            }
            .onChange(of: chatVM.streamingText) { _, _ in
                scrollToBottom(proxy, animated: false)
            }
            .onChange(of: chatVM.errorMessage) { _, newValue in
                if newValue != nil {
                    withAnimation { proxy.scrollTo("error", anchor: .bottom) }
                }
            }
            .onChange(of: chatVM.isUploadingImages) { _, uploading in
                if uploading {
                    withAnimation { proxy.scrollTo("uploading", anchor: .bottom) }
                }
            }
        }
    }

    /// Centered divider label when assistant follows user or vice versa.
    private func boundaryTimestamp(for message: Message) -> String? {
        guard let idx = chatVM.messages.firstIndex(where: { $0.id == message.id }), idx > 0 else {
            return nil
        }
        let prev = chatVM.messages[idx - 1]
        guard prev.role != message.role else { return nil }
        let ref = message.createdAt ?? prev.createdAt
        guard let ref else { return nil }
        return Self.dividerDateFormatter.string(from: ref)
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        let scroll = {
            if chatVM.errorMessage != nil {
                proxy.scrollTo("error", anchor: .bottom)
            } else if chatVM.isStreaming && !chatVM.isUploadingImages {
                proxy.scrollTo("streamingRow", anchor: .bottom)
            } else if chatVM.isUploadingImages {
                proxy.scrollTo("uploading", anchor: .bottom)
            } else if let lastId = chatVM.messages.last?.id {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
        if animated {
            withAnimation { scroll() }
        } else {
            scroll()
        }
    }

    // MARK: - Attachment Preview

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
        .background(useLandingChrome ? Color.clear : AppConstants.chatCanvasBlack)
    }
}

#Preview {
    ChatView()
        .environmentObject(ChatViewModel())
        .environmentObject(SidebarViewModel())
        .environmentObject(LibraryViewModel())
        .environmentObject(AuthService.shared)
}
