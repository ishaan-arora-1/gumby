import SwiftUI

/// Top-level Models / UGC screen — TikTok-style vertical feed of AI-actor
/// templates plus a "My Videos" tab for generated jobs.
///
/// Tapping the "Use" button on any template now hands off to the AI Chat tab,
/// which runs the full UGC creation funnel (product → script → voice →
/// ElevenLabs TTS → Kling lip-sync). The old bottom-sheet generation form
/// has been retired in favor of that guided experience.
struct UGCView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var ugcVM: UGCViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @Binding var selectedDestination: NavigationDestination

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                tabBar
                content
            }
        }
        .task {
            // `force: true` so we always fetch fresh signed URLs — stale
            // in-memory templates were a frequent source of "video stuck
            // on loading" reports. The HTTP layer is also no-store now.
            await ugcVM.loadTemplates(force: true)
            await ugcVM.loadVoices()
            await ugcVM.loadJobs()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button(action: { sidebarVM.toggle() }) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }
            Spacer()
            Text("Models")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppConstants.textPrimary)
            Spacer()
            Color.clear.frame(width: 28, height: 28)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(UGCViewModel.Tab.allCases, id: \.self) { tab in
                Button(action: { ugcVM.selectedTab = tab }) {
                    VStack(spacing: 6) {
                        Text(tab.rawValue)
                            .font(.system(size: 14, weight: ugcVM.selectedTab == tab ? .semibold : .regular))
                            .foregroundColor(ugcVM.selectedTab == tab ? AppConstants.textPrimary : AppConstants.textSecondary)
                        Rectangle()
                            .fill(ugcVM.selectedTab == tab ? AnyShapeStyle(AppConstants.accentGradient) : AnyShapeStyle(Color.clear))
                            .frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var content: some View {
        switch ugcVM.selectedTab {
        case .templates:
            UGCTemplatesFeed(
                onGenerate: { template in
                    handoffToChat(with: template)
                }
            )
        case .myVideos:
            UGCMyVideosView()
        }
    }

    private func handoffToChat(with template: UGCTemplate) {
        // Reset the chat to a clean state, drop the user just past template
        // selection, and navigate. This keeps the funnel feeling like one
        // continuous experience whether the user enters through the feed or
        // the chat tab directly.
        chatVM.newConversation()
        chatVM.pickTemplate(template)
        selectedDestination = .chat
    }
}

#Preview {
    UGCView(selectedDestination: .constant(.ugc))
        .environmentObject(SidebarViewModel())
        .environmentObject(UGCViewModel())
        .environmentObject(ChatViewModel())
}
