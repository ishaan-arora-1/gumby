import SwiftUI

enum NavigationDestination: Hashable {
    case chat
    case explore
    case calendar
    case posts
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
                .padding(.top, 8)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("explore")
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundStyle(AppConstants.textPrimary)
                        .padding(.top, 12)

                    VStack(spacing: 12) {
                        exploreButton(title: "Models") {
                            selectedDestination = .explore
                            sidebarVM.close()
                        }
                        exploreButton(title: "Calendar") {
                            selectedDestination = .calendar
                            sidebarVM.close()
                        }
                        exploreButton(title: "Posts") {
                            selectedDestination = .posts
                            sidebarVM.close()
                        }
                    }

                    historyList
                        .padding(.top, 8)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }

            footerBar
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
                .padding(.top, 6)
        }
        .frame(maxHeight: .infinity)
        .background(AppConstants.chatCanvasBlack)
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            Button(action: {}) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppConstants.textPrimary)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(AppConstants.chatComposerInner))
            }

            Menu {
                Button("Created by me") {}
                Button("Shared with me") {}
            } label: {
                HStack(spacing: 6) {
                    Text("Created by me")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppConstants.textPrimary)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(AppConstants.textPrimary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(AppConstants.chatComposerInner)
                .clipShape(Capsule())
            }

            Spacer()
        }
    }

    // MARK: - Explore buttons

    private func exploreButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(.white)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(SidebarStyle.modelsBlue)
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

    // MARK: - Footer

    private var footerBar: some View {
        HStack(spacing: 10) {
            Menu {
                Button {
                    chatVM.newConversation()
                    selectedDestination = .chat
                    sidebarVM.close()
                } label: {
                    Label("New chat", systemImage: "square.and.pencil")
                }
                Divider()
                Button(role: .destructive) {
                    authService.signOut()
                    sidebarVM.close()
                } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            } label: {
                HStack(spacing: 10) {
                    workspaceAvatar
                    Text(workspaceName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AppConstants.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(AppConstants.chatComposerInner)
                )
            }

            ZStack(alignment: .topTrailing) {
                profileAvatar
                    .frame(width: 40, height: 40)
                    .clipShape(Circle())

                Circle()
                    .fill(Color(red: 1.0, green: 0.27, blue: 0.27))
                    .frame(width: 10, height: 10)
                    .overlay(Circle().stroke(AppConstants.chatCanvasBlack, lineWidth: 2))
                    .offset(x: 1, y: -1)
            }
        }
    }

    private var workspaceName: String {
        let first = authService.currentUser?.name.split(separator: " ").first.map(String.init) ?? "My"
        return "\(first)'s Gumby"
    }

    private var workspaceInitial: String {
        let name = authService.currentUser?.name ?? "M"
        return String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
    }

    private var workspaceAvatar: some View {
        Circle()
            .fill(LinearGradient(
                colors: [Color(red: 0.93, green: 0.18, blue: 0.55), Color(red: 0.78, green: 0.29, blue: 0.93)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ))
            .frame(width: 28, height: 28)
            .overlay(
                Text(workspaceInitial)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
            )
    }

    @ViewBuilder
    private var profileAvatar: some View {
        if let avatarURL = authService.currentUser?.avatarURL,
           let url = URL(string: avatarURL) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Circle().fill(AppConstants.chatComposerInner)
            }
        } else {
            Circle()
                .fill(AppConstants.accentGradient)
                .overlay(
                    Text(workspaceInitial)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                )
        }
    }
}

private enum SidebarStyle {
    static let modelsBlue = Color(red: 0.16, green: 0.27, blue: 0.55)
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
