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

    @State private var gridSelectedTemplate: UGCTemplate?
    @State private var gridSelectedCreator: UGCCreatorJob?

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                modelsTopChrome
                content
            }
        }
        .task {
            // `force: true` so we always fetch fresh signed URLs — stale
            // in-memory templates were a frequent source of "video stuck
            // on loading" reports. The HTTP layer is also no-store now.
            await ugcVM.loadTemplates(force: true)
            await ugcVM.loadJobs()
            await ugcVM.loadLibrary(force: true)
        }
        .fullScreenCover(item: $gridSelectedTemplate) { template in
            UGCReelDetailView(
                template: template,
                onBack: { gridSelectedTemplate = nil },
                onGenerate: {
                    gridSelectedTemplate = nil
                    handoffToChat(with: template)
                }
            )
        }
        .fullScreenCover(item: $gridSelectedCreator) { creator in
            UGCLibraryReelDetailView(
                creator: creator,
                onBack: { gridSelectedCreator = nil },
                onUse: {
                    gridSelectedCreator = nil
                    handoffToChat(with: creator)
                }
            )
        }
    }

    // MARK: - Top chrome

    private var modelsTopChrome: some View {
        VStack(spacing: 14) {
            modelsHeader
            modelsTabPicker
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

    private var modelsHeader: some View {
        ZStack {
            Text("Models")
                .font(.gumby(20, weight: .semiBold))
                .foregroundStyle(AppConstants.textPrimary)

            HStack {
                modelsIconButton(systemName: "line.3.horizontal", action: { sidebarVM.toggle() })

                Spacer()

                if ugcVM.selectedTab == .explore || ugcVM.selectedTab == .library {
                    modelsIconButton(
                        systemName: ugcVM.feedLayout == .feed ? "square.grid.2x2" : "rectangle.portrait.fill",
                        action: {
                            withAnimation(.easeInOut(duration: 0.22)) {
                                ugcVM.feedLayout = ugcVM.feedLayout == .feed ? .grid : .feed
                            }
                        }
                    )
                } else {
                    Color.clear.frame(width: 38, height: 38)
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func modelsIconButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppConstants.textPrimary)
                .frame(width: 38, height: 38)
                .background(Circle().fill(AppConstants.chatComposerInner))
                .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
        }
    }

    private var modelsTabPicker: some View {
        HStack(spacing: 4) {
            ForEach(UGCViewModel.Tab.allCases, id: \.self) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.22)) {
                        ugcVM.selectedTab = tab
                    }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 11, weight: .semibold))
                        Text(tab.rawValue)
                            .font(.gumby(12.5, weight: ugcVM.selectedTab == tab ? .semiBold : .regular))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }
                    .foregroundStyle(ugcVM.selectedTab == tab ? Color.black : Color.white.opacity(0.72))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background {
                        if ugcVM.selectedTab == tab {
                            Capsule(style: .continuous)
                                .fill(Color.white)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            Capsule(style: .continuous)
                .fill(AppConstants.chatComposerInner)
        )
        .overlay(
            Capsule(style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var content: some View {
        switch ugcVM.selectedTab {
        case .explore:
            if ugcVM.feedLayout == .grid {
                UGCTemplatesGrid { template in
                    gridSelectedTemplate = template
                }
            } else {
                UGCTemplatesFeed(
                    onGenerate: { template in
                        handoffToChat(with: template)
                    }
                )
            }
        case .library:
            if ugcVM.feedLayout == .grid {
                UGCLibraryGrid { creator in
                    gridSelectedCreator = creator
                }
            } else {
                UGCLibraryFeed(
                    onUse: { creator in
                        handoffToChat(with: creator)
                    }
                )
            }
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

    private func handoffToChat(with creator: UGCCreatorJob) {
        chatVM.newConversation()
        chatVM.useLibraryItem(creator)
        selectedDestination = .chat
    }
}

#Preview {
    UGCView(selectedDestination: .constant(.ugc))
        .environmentObject(SidebarViewModel())
        .environmentObject(UGCViewModel())
        .environmentObject(ChatViewModel())
}
