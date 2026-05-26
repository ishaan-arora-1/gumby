import SwiftUI

@main
struct GumbyAIApp: App {
    @StateObject private var authService = AuthService.shared

    init() {
        GoogleSignInService.configure()
    }
    @StateObject private var sidebarVM = SidebarViewModel()
    @StateObject private var chatVM = ChatViewModel()
    @StateObject private var exploreVM = ExploreViewModel()
    @StateObject private var calendarVM = CalendarViewModel()
    @StateObject private var historyVM = HistoryViewModel()
    @StateObject private var libraryVM = LibraryViewModel()
    @StateObject private var ugcVM = UGCViewModel()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(sidebarVM)
                .environmentObject(chatVM)
                .environmentObject(exploreVM)
                .environmentObject(calendarVM)
                .environmentObject(historyVM)
                .environmentObject(libraryVM)
                .environmentObject(ugcVM)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    _ = GoogleSignInService.handle(url: url)
                }
        }
    }
}
