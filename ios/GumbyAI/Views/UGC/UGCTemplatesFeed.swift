import SwiftUI

/// Vertically-paged TikTok-style feed of UGC template clips.
struct UGCTemplatesFeed: View {
    @EnvironmentObject var ugcVM: UGCViewModel
    var onGenerate: (UGCTemplate) -> Void

    @State private var muted = true
    @State private var visibleIndex: Int = 0

    var body: some View {
        Group {
            if ugcVM.isLoadingTemplates && ugcVM.templates.isEmpty {
                loadingState
            } else if ugcVM.templates.isEmpty {
                emptyState
            } else {
                feedScroll
            }
        }
    }

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView().tint(.white)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "person.crop.rectangle.stack")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("No templates yet")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(AppConstants.textPrimary)
            Text(ugcVM.templatesError ?? "Pull to refresh once the backend has seeded templates.")
                .font(.system(size: 14))
                .foregroundColor(AppConstants.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    private var feedScroll: some View {
        GeometryReader { geo in
            let pageHeight = geo.size.height
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(ugcVM.templates.enumerated()), id: \.element.id) { idx, tpl in
                        UGCFeedCard(
                            template: tpl,
                            isActive: visibleIndex == idx,
                            muted: muted,
                            onToggleMute: { muted.toggle() },
                            onGenerate: { onGenerate(tpl) }
                        )
                        .frame(width: geo.size.width, height: pageHeight)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: VisibleCardKey.self,
                                    value: [VisibleCardEntry(index: idx, midY: proxy.frame(in: .global).midY)]
                                )
                            }
                        )
                    }
                }
            }
            .scrollTargetBehavior(.paging)
            .onPreferenceChange(VisibleCardKey.self) { entries in
                guard !entries.isEmpty else { return }
                let center = geo.frame(in: .global).midY
                let nearest = entries.min(by: { abs($0.midY - center) < abs($1.midY - center) })
                if let n = nearest, n.index != visibleIndex {
                    visibleIndex = n.index
                }
            }
        }
    }
}

private struct VisibleCardEntry: Equatable {
    let index: Int
    let midY: CGFloat
}

private struct VisibleCardKey: PreferenceKey {
    static var defaultValue: [VisibleCardEntry] = []
    static func reduce(value: inout [VisibleCardEntry], nextValue: () -> [VisibleCardEntry]) {
        value.append(contentsOf: nextValue())
    }
}

// MARK: - Card

struct UGCFeedCard: View {
    let template: UGCTemplate
    let isActive: Bool
    let muted: Bool
    var edgeToEdge: Bool = false
    let onToggleMute: () -> Void
    let onGenerate: () -> Void

    var body: some View {
        ZStack {
            Color.black

            if let videoURL = URL(string: template.videoURL) {
                LoopingVideoView(url: videoURL, isActive: isActive, muted: muted, aspectFill: true)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea(edges: edgeToEdge ? .all : [])
            } else {
                AsyncImage(url: URL(string: template.thumbnailURL)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.black
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: edgeToEdge ? .all : [])
            }

            // Creator + title only
            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            avatar
                            Text(template.actorName)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        Text(template.name)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(2)
                    }
                    .padding(.trailing, 64)

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, edgeToEdge ? 20 : 28)
            }

            // Right-side action rail
            VStack(spacing: 18) {
                Spacer()
                ReelActionButton(
                    systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    action: onToggleMute
                )
                ReelActionButton(systemName: "wand.and.stars", style: .mono, action: onGenerate)
                if !edgeToEdge {
                    Spacer().frame(height: 64)
                }
            }
            .padding(.bottom, edgeToEdge ? 12 : 0)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 12)

            // Soft gradients for legibility
            VStack {
                LinearGradient(
                    colors: [Color.black.opacity(0.5), .clear],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 80)
                Spacer()
                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.65)],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: edgeToEdge ? 160 : 200)
            }
            .ignoresSafeArea(edges: edgeToEdge ? .all : [])
            .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private var avatar: some View {
        Group {
            if let url = template.actorAvatarURL.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.gray.opacity(0.4)
                }
            } else {
                Circle().fill(AppConstants.accentGradient)
            }
        }
        .frame(width: 36, height: 36)
        .clipShape(Circle())
        .overlay(Circle().stroke(.white.opacity(0.6), lineWidth: 1))
    }
}
