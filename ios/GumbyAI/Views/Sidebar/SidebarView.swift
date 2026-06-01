import SwiftUI

/// Navigation destinations exposed in the sidebar — mirrors the web app's
/// AppShell so iOS and web feel like the same product.
///
///   .chat    → Studio (the UGC funnel — direct prompt + studio card)
///   .ugc     → Creators (browse curated templates + your library of
///              previously-generated creators)
///   .history → History (every UGC ad you've ever generated)
///   .explore → legacy; no longer surfaced in the sidebar but kept so any
///              existing deep links don't crash.
enum NavigationDestination: Hashable {
    case chat
    case explore
    case ugc
    case history
}

/// Slide-over sidebar shown when the user taps the hamburger icon on
/// any top-level screen. Faithful port of the web AppShell:
///
///   [logo]
///
///   Studio
///   Creators
///   History
///   Account
///
///   ─── RECENTS ───
///   • recent video 1
///   • recent video 2
///   • …
///
/// Account opens the existing ProfileView sheet, which already houses
/// the Sign Out and Delete Account buttons (Apple Guideline 5.1.1).
struct SidebarView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var ugcVM: UGCViewModel
    @Binding var selectedDestination: NavigationDestination

    @State private var showProfile = false

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
            // Refresh the recent-videos list every time the sidebar opens so
            // a newly-finished generation appears without a relaunch.
            guard isOpen else { return }
            Task { await ugcVM.loadJobs() }
        }
        .sheet(isPresented: $showProfile) {
            ProfileView()
                .environmentObject(authService)
        }
    }

    // MARK: - Sidebar content

    private var sidebarContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            topBar
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 18)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 4) {
                    navRow(
                        label: "Studio",
                        systemImage: "sparkles",
                        isActive: selectedDestination == .chat,
                        action: { goTo(.chat, resetFresh: true) }
                    )
                    navRow(
                        label: "Creators",
                        systemImage: "person.2",
                        isActive: selectedDestination == .ugc,
                        action: { goTo(.ugc) }
                    )
                    navRow(
                        label: "History",
                        systemImage: "clock.arrow.circlepath",
                        isActive: selectedDestination == .history,
                        action: { goTo(.history) }
                    )
                    navRow(
                        label: "Account",
                        systemImage: "person.crop.circle",
                        isActive: false,
                        action: {
                            sidebarVM.close()
                            showProfile = true
                        }
                    )

                    recentsSection
                        .padding(.top, 18)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 28)
            }
        }
        .frame(maxHeight: .infinity)
        .background(AppConstants.chatCanvasBlack)
    }

    // MARK: - Top bar (just the logo — web has logo+collapse here too)

    private var topBar: some View {
        HStack(alignment: .center) {
            Image("LogoCombined")
                .resizable()
                .scaledToFit()
                .frame(height: 32)
                .accessibilityLabel("Blinkugc")
            Spacer(minLength: 0)
        }
    }

    // MARK: - Nav row

    @ViewBuilder
    private func navRow(
        label: String,
        systemImage: String,
        isActive: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .medium))
                    .frame(width: 18)
                Text(label)
                    .font(.gumby(15, weight: isActive ? .semiBold : .medium))
                Spacer()
            }
            .foregroundStyle(isActive ? Color.white : Color.white.opacity(0.6))
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isActive ? Color.white.opacity(0.08) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Recents (UGC video jobs)

    @ViewBuilder
    private var recentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RECENTS")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.8)
                .foregroundStyle(Color.white.opacity(0.35))
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 2)

            if ugcVM.isLoadingJobs && ugcVM.jobs.isEmpty {
                ProgressView()
                    .tint(.white.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 14)
            } else if ugcVM.jobs.isEmpty {
                Text("No generations yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.35))
                    .padding(.horizontal, 12)
            } else {
                // Match web: cap at 12 to keep the sidebar scannable.
                ForEach(ugcVM.jobs.prefix(12)) { job in
                    Button {
                        openRecent(job)
                    } label: {
                        RecentRow(job: job)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Actions

    private func goTo(_ dest: NavigationDestination, resetFresh: Bool = false) {
        // Web's behavior: tapping the Studio nav while already on /studio
        // resets to a fresh welcome state. iOS mirrors that by calling
        // `newConversation()` on the chat VM when re-entering Studio.
        if resetFresh, dest == .chat, selectedDestination == .chat {
            chatVM.newConversation()
        }
        selectedDestination = dest
        sidebarVM.close()
    }

    private func openRecent(_ job: UGCJob) {
        // Surface the job in the History destination. The detail sheet is
        // opened by setting `focusedJobId` on the shared UGCViewModel —
        // UGCMyVideosView observes it and presents the player sheet.
        ugcVM.focusedJobId = job.id
        selectedDestination = .history
        sidebarVM.close()
    }
}

// MARK: - One row in the Recents list

private struct RecentRow: View {
    let job: UGCJob

    var body: some View {
        HStack(spacing: 12) {
            thumb
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.90))
                    .lineLimit(1)
                Text(relativeTime)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.42))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    private var title: String {
        let t = job.productName.trimmingCharacters(in: .whitespaces)
        if !t.isEmpty { return t }
        if let name = job.templateSnapshot?.name, !name.isEmpty { return name }
        return "Untitled"
    }

    @ViewBuilder
    private var thumb: some View {
        if let urlStr = job.outputThumbnailURL ?? job.templateSnapshot?.thumbnailURL,
           let url = URL(string: urlStr) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    placeholderFill
                }
            }
        } else {
            placeholderFill
        }
    }

    private var placeholderFill: some View {
        LinearGradient(
            colors: [
                Color.white.opacity(0.06),
                Color.white.opacity(0.02),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var relativeTime: String {
        guard let date = job.createdAt else { return "" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }
}
