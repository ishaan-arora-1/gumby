import SwiftUI

/// Top-level "Creators" screen.
///
/// Previously this had an Explore / Library tab picker and a grid/feed
/// layout toggle. We've collapsed it down to a single History-style
/// 2-column grid of templates — no tabs, no toggles, just a scroll of
/// 9:16 looping creator clips. Tapping a tile opens a web-style
/// preview sheet with a "Use as template" CTA that hands off to the
/// chat funnel (same handoff the old flow used).
struct UGCView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var ugcVM: UGCViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @Binding var selectedDestination: NavigationDestination

    @State private var previewTemplate: UGCTemplate?
    /// Set when the user taps "Use as template" inside the preview cover.
    /// We dismiss the cover first and run the actual handoff in the
    /// cover's `onDismiss` — see the `.fullScreenCover` below.
    @State private var pendingHandoff: UGCTemplate?

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                grid
            }
        }
        .task {
            // `force: true` so we always fetch fresh signed URLs — stale
            // in-memory templates were a frequent source of "video stuck
            // on loading" reports. The HTTP layer is also no-store now.
            await ugcVM.loadTemplates(force: true)
        }
        .fullScreenCover(item: $previewTemplate, onDismiss: {
            // The cover (and its AVPlayer-backed LoopingVideoView) is now
            // fully torn down. Only NOW do we switch the top-level
            // destination to .chat. Doing the handoff here — instead of
            // inside the button while the cover is still presented —
            // fixes two bugs at once:
            //   1. the navigation getting swallowed (the destination
            //      switch used to race the cover teardown, so you'd never
            //      land on the studio form), and
            //   2. the AVPlayer cleanup crash that happened when the
            //      cover dismissed and the destination switched in the
            //      same pass.
            if let template = pendingHandoff {
                pendingHandoff = nil
                handoffToChat(with: template)
            }
        }) { template in
            UGCTemplatePreviewSheet(
                template: template,
                onClose: { previewTemplate = nil },
                onUse: {
                    // Record the choice and dismiss the cover. The actual
                    // handoff runs in `onDismiss` above, once teardown is
                    // complete.
                    pendingHandoff = template
                    previewTemplate = nil
                }
            )
        }
    }

    // MARK: - Header (matches History: title centered, hamburger left, nothing right)

    private var header: some View {
        ZStack {
            Text("Creators")
                .font(.gumby(20, weight: .semiBold))
                .foregroundStyle(AppConstants.textPrimary)

            HStack {
                Button(action: { sidebarVM.toggle() }) {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AppConstants.textPrimary)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(AppConstants.chatComposerInner))
                        .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
                }
                Spacer()
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

    // MARK: - Grid

    private var gridColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: 8),
            GridItem(.flexible(), spacing: 8),
        ]
    }

    @ViewBuilder
    private var grid: some View {
        if ugcVM.isLoadingTemplates && ugcVM.templates.isEmpty {
            ProgressView()
                .tint(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if ugcVM.templates.isEmpty {
            emptyState
        } else {
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: 8) {
                    ForEach(ugcVM.templates) { template in
                        UGCTemplateCard(template: template) {
                            previewTemplate = template
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            }
            .refreshable { await ugcVM.loadTemplates(force: true) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "person.crop.rectangle.stack")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("No creators yet")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
            Text("New AI creators land here as we add them.")
                .font(.system(size: 14))
                .foregroundColor(AppConstants.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    // MARK: - Handoff

    private func handoffToChat(with template: UGCTemplate) {
        // Drop the user just past template selection and navigate to the
        // chat funnel. `pickTemplate` already calls
        // `resetFunnelStateForNewRun()` (clears drafts, polling, active
        // jobs) and then synchronously creates the first draft.
        //
        // IMPORTANT: do NOT also call `chatVM.newConversation()` here —
        // it schedules a delayed Task that wipes `drafts = []` 500 ms
        // later, which races with the draft just created by
        // `pickTemplate` and crashes `UGCStudioView` with an
        // index-out-of-range on `drafts[activeDraftIndex]`.
        chatVM.pickTemplate(template)
        selectedDestination = .chat
    }
}

// MARK: - Template grid card (mirrors UGCJobCard in History)

private struct UGCTemplateCard: View {
    let template: UGCTemplate
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack {
                tileMedia

                VStack {
                    Spacer()
                    HStack(alignment: .center, spacing: 6) {
                        nameChip
                        Spacer()
                    }
                    .padding(8)
                    .background(
                        LinearGradient(
                            colors: [.clear, Color.black.opacity(0.7)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                }
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var tileMedia: some View {
        if let videoURL = URL(string: template.videoURL) {
            LoopingVideoView(url: videoURL, isActive: true, muted: true, aspectFill: true)
        } else if let url = URL(string: template.thumbnailURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Color(hex: "1A1A1A")
                }
            }
        } else {
            Color(hex: "1A1A1A")
        }
    }

    private var nameChip: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Color.white.opacity(0.85))
                .frame(width: 6, height: 6)
            Text(template.actorName.isEmpty ? template.name : template.actorName)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(.ultraThinMaterial))
    }
}

// MARK: - Template preview sheet
//
// SwiftUI port of `web/components/studio/TemplateCard.tsx` →
// `TemplatePreviewModal`. The user sees the clip full-bleed in a 9:16
// card with a "Use as template" CTA floating at the bottom, an X close
// button anchored top-right, and the creator name + description below.

/// Reusable full-screen template preview. Shows the looping 9:16 video,
/// a creator caption, and a floating "Use as template" CTA. Used on both
/// the Creators tab (`UGCView`) and the AI-chat bottom templates strip
/// (`WebStudioWelcomeView`) so the "preview → use" UX is identical
/// everywhere a template can be picked.
struct UGCTemplatePreviewSheet: View {
    let template: UGCTemplate
    let onClose: () -> Void
    let onUse: () -> Void

    @State private var muted = true

    var body: some View {
        ZStack {
            // Dim backdrop. Tap-to-dismiss outside the card, matching web.
            Color.black.opacity(0.92)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(spacing: 16) {
                videoCard

                VStack(spacing: 4) {
                    Text(template.actorName.isEmpty ? template.name : template.actorName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if !template.description.isEmpty {
                        Text(template.description)
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.55))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .padding(.horizontal, 24)
                    }
                }
            }
            .padding(.horizontal, 20)

            // Top-right close button, anchored to the viewport like the
            // web preview modal.
            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.white.opacity(0.10)))
                            .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }

    private var videoCard: some View {
        ZStack {
            // 9:16 video. The card stops the tap-to-dismiss from firing
            // when the user taps the video itself (matching web's
            // `e.stopPropagation()` on the inner wrapper).
            Group {
                if let url = URL(string: template.videoURL) {
                    LoopingVideoView(url: url, isActive: true, muted: muted, aspectFill: true)
                } else if let url = URL(string: template.thumbnailURL) {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase {
                            image.resizable().scaledToFill()
                        } else {
                            Color(hex: "1A1A1A")
                        }
                    }
                } else {
                    Color(hex: "1A1A1A")
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )

            // Soft bottom shade so the floating CTA always reads against
            // any video content.
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            .clear,
                            Color.black.opacity(0.45),
                            Color.black.opacity(0.85),
                        ],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .allowsHitTesting(false)

            // Mute toggle, top-left of the video card.
            VStack {
                HStack {
                    Button { muted.toggle() } label: {
                        Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(Color.black.opacity(0.45)))
                    }
                    Spacer()
                }
                .padding(10)
                Spacer()
            }

            // Floating "Use as template" CTA — bottom-center over the video,
            // mirroring the web preview modal.
            VStack {
                Spacer()
                Button(action: onUse) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .bold))
                        Text("Use as template")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 22)
                    .frame(height: 46)
                    .background(Capsule(style: .continuous).fill(Color.white))
                    .shadow(color: .black.opacity(0.4), radius: 16, x: 0, y: 6)
                }
                .buttonStyle(.plain)
                .padding(.bottom, 18)
            }
        }
        .aspectRatio(9.0/16.0, contentMode: .fit)
        .frame(maxWidth: 420)
    }
}

#Preview {
    UGCView(selectedDestination: .constant(.ugc))
        .environmentObject(SidebarViewModel())
        .environmentObject(UGCViewModel())
        .environmentObject(ChatViewModel())
}
