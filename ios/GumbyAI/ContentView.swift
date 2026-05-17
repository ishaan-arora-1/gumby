import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var historyVM: HistoryViewModel
    @State private var selectedDestination: NavigationDestination = .chat
    @StateObject private var remoteImagePreview = RemoteImagePreviewController.shared

    var body: some View {
        Group {
            if authService.isAuthenticated {
                mainContent
                    .task(id: authService.currentUser?.id ?? "") {
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
            ExploreView(selectedDestination: $selectedDestination)
        case .ugc:
            UGCView()
        case .calendar:
            CalendarView()
        case .posts:
            PostsView()
        case .history:
            HistoryView(selectedDestination: $selectedDestination)
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
