import SwiftUI
import PhotosUI

/// SwiftUI port of `web/app/(app)/studio/page.tsx` welcome state, sized
/// for phones (not desktop).
///
/// Top-to-bottom:
///   • Floating header (Blink UGC logo + menu + new-chat buttons). Background
///     is transparent at the top of the page and fades to a translucent
///     surface the moment the user scrolls — same behavior as the website.
///   • Centered italic serif headline ("Describe your content…")
///   • WebPromptComposer
///   • Suggestion chip row
///   • Section label + "Featured templates" heading
///   • 2-column grid of 9:16 template cards
///
/// State plumbing is unchanged — same `chatVM.composerPrompt`,
/// `submitDirectPrompt()`, etc. Pure UI swap.
struct WebStudioWelcomeView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel

    /// Height of the floating header — content needs this much top padding
    /// so the headline doesn't get covered when the page is at rest.
    private let headerHeight: CGFloat = 56

    // Mirrors the Creators-tab preview flow: tapping a template card opens
    // the full-screen preview, and the actual `pickTemplate(_:)` handoff
    // runs in the cover's `onDismiss` AFTER teardown so the AVPlayer-backed
    // LoopingVideoView never gets torn down concurrently with the funnel
    // step change (which used to crash and/or swallow the navigation).
    @State private var previewTemplate: UGCTemplate?
    @State private var pendingHandoff: UGCTemplate?

    var body: some View {
        // GeometryReader gives us the viewport height so the first "page"
        // can fill the visible area and the templates section can be made
        // to peek up from the bottom by exactly the amount we want.
        //
        // `.ignoresSafeArea(.keyboard, edges: .bottom)` keeps that
        // viewport height pinned to the full screen even when the
        // keyboard is open — otherwise the keyboard shrinks geo.size,
        // shrinks firstPage's minHeight, and yanks the "Featured
        // templates" section up over the composer. The ScrollView still
        // auto-scrolls the focused TextEditor above the keyboard, so the
        // composer remains usable; the templates just stay parked at
        // their resting position below the fold.
        GeometryReader { geo in
            ZStack(alignment: .top) {
                scrollContent(viewportHeight: geo.size.height)
                floatingHeader
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .background(WebTheme.Color.canvas)
        // Full-screen preview for the templates strip. Picking happens
        // in `onDismiss` so the cover (and its LoopingVideoView) finishes
        // tearing down before the funnel step changes — same pattern the
        // Creators tab uses.
        .fullScreenCover(item: $previewTemplate, onDismiss: {
            if let tpl = pendingHandoff {
                pendingHandoff = nil
                chatVM.pickTemplate(tpl)
            }
        }) { template in
            UGCTemplatePreviewSheet(
                template: template,
                onClose: { previewTemplate = nil },
                onUse: {
                    pendingHandoff = template
                    previewTemplate = nil
                }
            )
        }
    }

    // MARK: - Scrollable content

    /// How much of the templates section should peek above the fold of
    /// the first page. 72pt gets the "Or pick a creator" kicker + the
    /// "Featured templates" heading visible so the user knows there's
    /// more if they scroll.
    private let templatesPeek: CGFloat = 72

    private func scrollContent(viewportHeight: CGFloat) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                firstPage
                    // First "page" fills the visible viewport minus the
                    // peek — that's what gets the templates section to
                    // appear just above the bottom edge instead of being
                    // fully hidden until you scroll.
                    .frame(minHeight: max(0, viewportHeight - templatesPeek))

                templatesSection
                    .padding(.horizontal, 14)
                    .padding(.top, 18)
                    .padding(.bottom, 32)
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /// The above-the-fold layout. Spacers above and below center the
    /// headline + composer group near the vertical midline of the
    /// viewport, with the suggestion row hanging just below the gap.
    private var firstPage: some View {
        VStack(spacing: 0) {
            // Clear the floating header so the centered group never tucks
            // under the logo bar.
            Color.clear.frame(height: headerHeight + 8)

            // Top spacer — equal-weight to the bottom one, so the
            // centered block sits at the visual middle of the page.
            Spacer(minLength: 0)

            // The centered block — headline + composer together.
            VStack(spacing: 18) {
                headline
                WebPromptComposer()
            }
            .padding(.horizontal, 14)

            // "A little gap" between the composer and the suggestion row.
            Color.clear.frame(height: 0)

            suggestionRow
                .padding(.horizontal, 14)

            // Bottom spacer — same flex as top so the centered block stays
            // centered, with the templates peeking up from below it.
            Spacer(minLength: 0)
        }
    }

    // MARK: - Floating header (always solid canvas-colored)

    private var floatingHeader: some View {
        // Always sits on a flat slab of the same canvas color the rest of
        // the AI Chat page uses, so the logo bar never looks like it's
        // floating over scrolling content.
        ZStack {
            HStack(spacing: 0) {
                Button(action: { sidebarVM.toggle() }) {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
                Spacer()
                Button(action: { chatVM.newConversation() }) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
            }

            Image("LogoCombined")
                .resizable()
                .scaledToFit()
                .frame(height: 30)
                .accessibilityLabel("Blinkugc")
        }
        .padding(.horizontal, 14)
        .frame(height: headerHeight)
        .background {
            // Flat slab of canvas color, extended up into the safe-area /
            // status bar region so the notch area matches the rest of
            // the page background.
            WebTheme.Color.canvas
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(Color.white.opacity(0.06))
                        .frame(height: 0.5)
                }
                .ignoresSafeArea(edges: .top)
        }
    }

    // MARK: - Headline ("Describe your content…")

    private var headline: some View {
        // Web uses clamp(28px, 4.4vw, 64px). On a 390px-wide iPhone the
        // 4.4vw value resolves to ~17px so the floor (28px) wins — that's
        // what shows on mobile. Match it at 28pt.
        Text("Describe your content…")
            .font(WebTheme.Font.serifItalic(28))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .lineSpacing(2)
            .tracking(-0.2)
            .frame(maxWidth: .infinity)
    }

    // MARK: - Suggestion chips

    private static let suggestions: [String] = [
        "20-year-old skincare creator unboxing serum in her kitchen, daylight",
        "Fitness creator in a gym holding a protein shake, neon lights",
        "Cozy creator on a couch sipping coffee, golden hour",
        "Tech creator at a desk holding a sleek gadget, studio light",
    ]

    private var suggestionRow: some View {
        WebFlowLayout(spacing: 6) {
            ForEach(Self.suggestions, id: \.self) { s in
                Button {
                    chatVM.composerPrompt = s
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(WebTheme.Color.accent2)
                        Text(truncate(s, max: 38))
                            .font(WebTheme.Font.body(11, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule(style: .continuous).fill(Color.white.opacity(0.03))
                    )
                    .overlay(
                        Capsule(style: .continuous)
                            .stroke(WebTheme.Color.border, lineWidth: 1)
                    )
                }
                .buttonStyle(WebPressStyle())
            }
        }
    }

    private func truncate(_ s: String, max: Int) -> String {
        s.count > max ? String(s.prefix(max)) + "…" : s
    }

    // MARK: - Templates section

    private var templatesSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Or pick a creator")
                .webSectionLabel()
                .padding(.bottom, 6)

            Text("Featured templates")
                .font(WebTheme.Font.display(18, weight: .bold))
                .foregroundColor(.white)
                .tracking(-0.2)
                .padding(.bottom, 14)

            templatesGrid
                .task { await chatVM.ensureTemplatesLoaded() }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var templatesGrid: some View {
        let columns = [
            GridItem(.flexible(), spacing: 8),
            GridItem(.flexible(), spacing: 8),
        ]
        LazyVGrid(columns: columns, spacing: 8) {
            if chatVM.templates.isEmpty && chatVM.isLoadingTemplates {
                ForEach(0..<6, id: \.self) { _ in
                    skeletonCard
                }
            } else {
                ForEach(chatVM.templates) { tpl in
                    WebTemplateCard(template: tpl) {
                        // Open the preview instead of going straight to
                        // the studio form — matches the Creators tab and
                        // lets the user see the looping creator clip
                        // before committing.
                        previewTemplate = tpl
                    }
                }
            }
        }
    }

    private var skeletonCard: some View {
        RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
            .fill(WebTheme.Color.elevated.opacity(0.4))
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                    .stroke(WebTheme.Color.borderSubtle, lineWidth: 1)
            )
    }
}

// MARK: - Flow layout (SwiftUI flex-wrap equivalent)

struct WebFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var maxRowWidth: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if rowWidth + s.width > maxWidth, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                maxRowWidth = max(maxRowWidth, rowWidth - spacing)
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        totalHeight += rowHeight
        maxRowWidth = max(maxRowWidth, rowWidth - spacing)
        return CGSize(width: maxRowWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let s = sub.sizeThatFits(.unspecified)
            if x + s.width > maxWidth, x > 0 {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y),
                      proposal: ProposedViewSize(width: s.width, height: s.height))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
