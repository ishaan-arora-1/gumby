import SwiftUI

/// Vertically-paged feed of the user's previously generated creator clips —
/// the "Library" tab on the Models screen. Visually mirrors
/// `UGCTemplatesFeed` so users feel like they're picking from a single
/// catalog (Explore + their own). Tapping "Use" promotes the clip to a
/// reusable template (idempotently on the backend) and drops the user
/// straight onto the product entry step in the chat funnel.
struct UGCLibraryFeed: View {
    @EnvironmentObject var ugcVM: UGCViewModel

    var onUse: (UGCCreatorJob) -> Void

    @State private var muted = true
    @State private var visibleIndex: Int = 0

    var body: some View {
        Group {
            if ugcVM.isLoadingLibrary && ugcVM.library.isEmpty {
                loadingState
            } else if ugcVM.library.isEmpty {
                emptyState
            } else {
                feedScroll
            }
        }
        .task { await ugcVM.loadLibrary(force: false) }
        .refreshable { await ugcVM.loadLibrary(force: true) }
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
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("Your library is empty")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(AppConstants.textPrimary)
            Text(ugcVM.libraryError ??
                 "Generate a creator from the AI Chat tab and it will show up here for easy reuse.")
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
                    ForEach(Array(ugcVM.library.enumerated()), id: \.element.id) { idx, creator in
                        UGCLibraryCard(
                            creator: creator,
                            isActive: visibleIndex == idx,
                            muted: muted,
                            onToggleMute: { muted.toggle() },
                            onUse: { onUse(creator) }
                        )
                        .frame(width: geo.size.width, height: pageHeight)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: LibraryVisibleCardKey.self,
                                    value: [LibraryVisibleCardEntry(index: idx, midY: proxy.frame(in: .global).midY)]
                                )
                            }
                        )
                    }
                }
            }
            .scrollTargetBehavior(.paging)
            .onPreferenceChange(LibraryVisibleCardKey.self) { entries in
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

private struct LibraryVisibleCardEntry: Equatable {
    let index: Int
    let midY: CGFloat
}

private struct LibraryVisibleCardKey: PreferenceKey {
    static var defaultValue: [LibraryVisibleCardEntry] = []
    static func reduce(value: inout [LibraryVisibleCardEntry], nextValue: () -> [LibraryVisibleCardEntry]) {
        value.append(contentsOf: nextValue())
    }
}

// MARK: - Card

struct UGCLibraryCard: View {
    let creator: UGCCreatorJob
    let isActive: Bool
    let muted: Bool
    var edgeToEdge: Bool = false
    let onToggleMute: () -> Void
    let onUse: () -> Void

    var body: some View {
        ZStack {
            Color.black

            if let urlString = creator.videoURL, let url = URL(string: urlString) {
                LoopingVideoView(url: url, isActive: isActive, muted: muted, aspectFill: true)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea(edges: edgeToEdge ? .all : [])
            } else if let thumb = creator.thumbnailURL, let thumbURL = URL(string: thumb) {
                AsyncImage(url: thumbURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.black
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: edgeToEdge ? .all : [])
            }

            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            libraryAvatar
                            Text("Your creator")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        Text(creator.prompt)
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

            VStack(spacing: 18) {
                Spacer()
                ReelActionButton(
                    systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    action: onToggleMute
                )
                ReelActionButton(systemName: "wand.and.stars", style: .mono, action: onUse)
                if !edgeToEdge {
                    Spacer().frame(height: 64)
                }
            }
            .padding(.bottom, edgeToEdge ? 12 : 0)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 12)

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

    private var libraryAvatar: some View {
        Circle()
            .fill(AppConstants.accentGradient)
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: "sparkles")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
            )
            .overlay(Circle().stroke(.white.opacity(0.6), lineWidth: 1))
    }
}
