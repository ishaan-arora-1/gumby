import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var historyVM: HistoryViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var creditsManager: CreditsManager
    @EnvironmentObject var storeKit: StoreKitService
    @State private var selectedDestination: NavigationDestination = .chat
    @StateObject private var remoteImagePreview = RemoteImagePreviewController.shared

    var body: some View {
        Group {
            if authService.isAuthenticated {
                mainContent
                    .task(id: authService.currentUser?.id ?? "") {
                        // Point the credit ledger at this user, hand it to
                        // the chat VM for generation gating, and start the
                        // StoreKit transaction listener (all idempotent).
                        await creditsManager.reload(forUserID: authService.currentUser?.id)
                        chatVM.attachCredits(creditsManager)
                        storeKit.start(credits: creditsManager)
                        // Preload conversation history so the sidebar opens instantly.
                        await historyVM.loadHistory()
                        GeneratedImagesStore.shared.reloadForCurrentUser()
                    }
            } else {
                AuthView()
            }
        }
    }
    
    private var mainContent: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            currentScreen
            
            SidebarView(selectedDestination: $selectedDestination)
        }
        .sheet(isPresented: Binding(
            get: { remoteImagePreview.presentation != nil },
            set: { if !$0 { remoteImagePreview.dismiss() } }
        )) {
            if let p = remoteImagePreview.presentation {
                RemoteImagePreviewSheet(urlString: p.url, onDismiss: remoteImagePreview.dismiss)
            }
        }
    }
    
    @ViewBuilder
    private var currentScreen: some View {
        switch selectedDestination {
        case .chat:
            ChatView()
        case .explore:
            // Legacy destination — still in the enum so old deep links
            // don't crash. Re-route to UGC (Creators) since no sidebar
            // entry exposes Explore anymore.
            UGCView(selectedDestination: $selectedDestination)
        case .ugc:
            UGCView(selectedDestination: $selectedDestination)
        case .history:
            // History was the old chat-conversations view. The new sidebar
            // points History at the UGC video grid (UGCMyVideosView), which
            // mirrors web's /history page. The standalone wrapper below
            // adds the top bar that UGCView used to provide.
            HistoryDestinationView(selectedDestination: $selectedDestination)
        }
    }
}

/// Standalone wrapper for UGCMyVideosView when it's shown as its own
/// top-level destination. Adds the same "Sidebar toggle + screen title"
/// chrome that UGCView already has, so History feels like a peer of
/// Studio/Creators instead of a tab buried inside Creators.
private struct HistoryDestinationView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var ugcVM: UGCViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @Binding var selectedDestination: NavigationDestination

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                // History items become reusable templates the same way
                // /history/[id] on web does — tap "Use creator" inside the
                // player sheet → backend mints a hidden template → we
                // pick it on ChatViewModel and jump to the Studio.
                UGCMyVideosView(onUseTemplate: { tpl in
                    chatVM.newConversation()
                    chatVM.pickTemplate(tpl)
                    selectedDestination = .chat
                })
            }
        }
        .task {
            await ugcVM.loadJobs()
        }
    }

    private var header: some View {
        ZStack {
            Text("History")
                .font(.gumby(20, weight: .semiBold))
                .foregroundStyle(AppConstants.textPrimary)

            HStack {
                Button {
                    sidebarVM.toggle()
                } label: {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AppConstants.textPrimary)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(AppConstants.chatComposerInner))
                        .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
                }
                .buttonStyle(.plain)
                Spacer()
                Color.clear.frame(width: 38, height: 38)
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, 6)
        .padding(.bottom, 12)
        .background {
            LinearGradient(
                colors: [
                    Color.black.opacity(0.96),
                    Color.black.opacity(0.88),
                    Color.black.opacity(0.0),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.06))
                .frame(height: 0.5)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthService.shared)
        .environmentObject(SidebarViewModel())
        .environmentObject(ChatViewModel())
        .environmentObject(ExploreViewModel())
        .environmentObject(CalendarViewModel())
        .environmentObject(HistoryViewModel())
        .environmentObject(LibraryViewModel())
        .environmentObject(UGCViewModel())
}
