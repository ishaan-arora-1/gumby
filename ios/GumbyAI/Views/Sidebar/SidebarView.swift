import SwiftUI

enum NavigationDestination: Hashable {
    case chat
    case explore
    case ugc
    case history
}

struct SidebarView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var historyVM: HistoryViewModel
    @Binding var selectedDestination: NavigationDestination

    @State private var didLoadHistory = false

    var body: some View {
        ZStack(alignment: .leading) {
            if sidebarVM.isOpen {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture { sidebarVM.close() }

                sidebarContent
                    .frame(width: UIScreen.main.bounds.width * AppConstants.sidebarWidthRatio)
                    .transition(.move(edge: .leading))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: sidebarVM.isOpen)
        .onChange(of: sidebarVM.isOpen) { _, isOpen in
            guard isOpen else { return }
            Task { await historyVM.loadHistory() }
            didLoadHistory = true
        }
    }

    private var sidebarContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            topBar
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 4)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    modelsButton
                        .padding(.top, 8)

                    historyList
                        .padding(.top, 8)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 72)
            }
        }
        .frame(maxHeight: .infinity)
        .background(AppConstants.chatCanvasBlack)
        .overlay(alignment: .bottomTrailing) {
            newChatButton
                .padding(.trailing, 18)
                .padding(.bottom, 18)
        }
    }

    // MARK: - Top bar (ChatGPT-style)

    private var topBar: some View {
        HStack(alignment: .center, spacing: 12) {
            Image("LogoCombined")
                .resizable()
                .scaledToFit()
                .frame(height: 38)
                .accessibilityLabel("Create UGC")

            Spacer(minLength: 8)

            HStack(spacing: 14) {
                Button(action: {}) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(AppConstants.textPrimary)
                }
                .buttonStyle(.plain)

                Menu {
                    Button(role: .destructive) {
                        authService.signOut()
                        sidebarVM.close()
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } label: {
                    profileAvatar
                        .frame(width: 32, height: 32)
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill(AppConstants.chatComposerInner)
            )
        }
    }

    // MARK: - New chat floater (bottom right)

    private var newChatButton: some View {
        Button {
            chatVM.newConversation()
            selectedDestination = .chat
            sidebarVM.close()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 15, weight: .semibold))
                Text("New chat")
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(
                Capsule(style: .continuous)
                    .fill(AppConstants.authAccentBlue)
            )
            .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Models

    private var modelsButton: some View {
        Button {
                selectedDestination = .ugc
                sidebarVM.close()
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(AppConstants.chatComposerInner)
                            .frame(width: 40, height: 40)
                        Image(systemName: "person.crop.rectangle.stack")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(AppConstants.accentGradient)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Models")
                            .font(.gumby(16, weight: .medium))
                            .foregroundStyle(AppConstants.textPrimary)
                        Text("Browse AI creators")
                            .font(.gumby(13, weight: .regular))
                            .foregroundStyle(AppConstants.chatMutedLabel)
                    }

                    Spacer(minLength: 0)

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                        .fill(AppConstants.chatComposerSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
    }

    // MARK: - History

    private var historyList: some View {
        VStack(spacing: 14) {
            if historyVM.isLoading && historyVM.conversations.isEmpty {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else if historyVM.conversations.isEmpty {
                Text("No chats yet")
                    .font(.subheadline)
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 20)
            } else {
                ForEach(historyVM.conversations) { conversation in
                    Button(action: { open(conversation) }) {
                        HistoryRow(conversation: conversation)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        if conversation.id == historyVM.conversations.last?.id {
                            Task { await historyVM.loadMore() }
                        }
                    }
                }
            }
        }
    }

    private func open(_ conversation: Conversation) {
        Task {
            await chatVM.loadConversation(conversation.id, title: conversation.title)
            selectedDestination = .chat
            sidebarVM.close()
        }
    }

    private var workspaceInitial: String {
        let name = authService.currentUser?.name ?? "M"
        return String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
    }

    @ViewBuilder
    private var profileAvatar: some View {
        monochromeAvatar(size: 32, fontSize: 13)
    }

    @ViewBuilder
    private func monochromeAvatar(size: CGFloat, fontSize: CGFloat) -> some View {
        if let avatarURL = authService.currentUser?.avatarURL,
           let url = URL(string: avatarURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .saturation(0)
                default:
                    avatarPlaceholder(size: size, fontSize: fontSize)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
        } else {
            avatarPlaceholder(size: size, fontSize: fontSize)
        }
    }

    private func avatarPlaceholder(size: CGFloat, fontSize: CGFloat) -> some View {
        Circle()
            .fill(Color(white: 0.22))
            .frame(width: size, height: size)
            .overlay(
                Text(workspaceInitial)
                    .font(.system(size: fontSize, weight: .semibold))
                    .foregroundStyle(Color(white: 0.92))
            )
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
    }
}

private struct HistoryRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 14) {
            Thumbnail(seed: conversation.id)
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(displayTitle)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppConstants.textPrimary)
                    .lineLimit(1)
                Text(dateString)
                    .font(.system(size: 13))
                    .foregroundStyle(AppConstants.chatMutedLabel)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var displayTitle: String {
        let trimmed = conversation.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Untitled chat" : trimmed
    }

    private var dateString: String {
        guard let date = conversation.createdAt else { return "" }
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateFormat = "d MMM yyyy"
        return f.string(from: date)
    }
}

private struct Thumbnail: View {
    let seed: String

    var body: some View {
        let palette: [(Color, Color)] = [
            (Color(red: 0.10, green: 0.10, blue: 0.12), Color(red: 0.18, green: 0.18, blue: 0.22)),
            (Color(red: 0.12, green: 0.18, blue: 0.32), Color(red: 0.22, green: 0.32, blue: 0.55)),
            (Color(red: 0.95, green: 0.78, blue: 0.86), Color(red: 0.96, green: 0.62, blue: 0.78)),
            (Color(red: 0.92, green: 0.92, blue: 0.92), Color(red: 1.0, green: 1.0, blue: 1.0)),
            (Color(red: 0.30, green: 0.16, blue: 0.40), Color(red: 0.55, green: 0.20, blue: 0.55))
        ]
        let pair = palette[abs(seed.hashValue) % palette.count]
        return LinearGradient(
            colors: [pair.0, pair.1],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay(
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white.opacity(0.55))
        )
    }
}
