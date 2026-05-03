import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @State private var selectedDestination: NavigationDestination = .chat
    
    var body: some View {
        Group {
            if authService.isAuthenticated {
                mainContent
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
    }
    
    @ViewBuilder
    private var currentScreen: some View {
        switch selectedDestination {
        case .chat:
            ChatView()
        case .explore:
            ExploreView(selectedDestination: $selectedDestination)
        case .calendar:
            CalendarView()
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
}
