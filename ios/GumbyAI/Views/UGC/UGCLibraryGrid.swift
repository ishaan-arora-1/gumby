import SwiftUI

/// Pinterest-style two-column masonry grid for Library creator clips.
struct UGCLibraryGrid: View {
    @EnvironmentObject var ugcVM: UGCViewModel
    var onSelect: (UGCCreatorJob) -> Void

    private let columnSpacing: CGFloat = 10
    private let horizontalPadding: CGFloat = 12
    private let tileSpacing: CGFloat = 10
    private let heightRatios: [CGFloat] = [1.42, 1.08, 1.58, 0.96, 1.22, 1.12, 1.35, 1.05]

    var body: some View {
        Group {
            if ugcVM.isLoadingLibrary && ugcVM.library.isEmpty {
                loadingState
            } else if ugcVM.library.isEmpty {
                emptyState
            } else {
                gridScroll
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
                .font(.gumby(18, weight: .medium))
                .foregroundColor(AppConstants.textPrimary)
            Spacer()
        }
    }

    private var gridScroll: some View {
        GeometryReader { geo in
            let columnWidth = (geo.size.width - horizontalPadding * 2 - columnSpacing) / 2
            let columns = masonryColumns(columnWidth: columnWidth)

            ScrollView(showsIndicators: false) {
                HStack(alignment: .top, spacing: columnSpacing) {
                    masonryColumn(items: columns.left, columnWidth: columnWidth)
                    masonryColumn(items: columns.right, columnWidth: columnWidth)
                }
                .padding(.horizontal, horizontalPadding)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
        }
    }

    private func masonryColumns(columnWidth: CGFloat) -> (left: [LibraryMasonryItem], right: [LibraryMasonryItem]) {
        var left: [LibraryMasonryItem] = []
        var right: [LibraryMasonryItem] = []
        var leftHeight: CGFloat = 0
        var rightHeight: CGFloat = 0

        for (index, creator) in ugcVM.library.enumerated() {
            let ratio = heightRatios[index % heightRatios.count]
            let height = columnWidth * ratio
            let item = LibraryMasonryItem(creator: creator, height: height)

            if leftHeight <= rightHeight {
                left.append(item)
                leftHeight += height + tileSpacing
            } else {
                right.append(item)
                rightHeight += height + tileSpacing
            }
        }
        return (left, right)
    }

    private func masonryColumn(items: [LibraryMasonryItem], columnWidth: CGFloat) -> some View {
        VStack(spacing: tileSpacing) {
            ForEach(items) { item in
                LibraryGridTile(creator: item.creator, height: item.height, columnWidth: columnWidth) {
                    onSelect(item.creator)
                }
            }
        }
        .frame(width: columnWidth)
    }
}

private struct LibraryMasonryItem: Identifiable {
    let creator: UGCCreatorJob
    let height: CGFloat
    var id: String { creator.id }
}

private struct LibraryGridTile: View {
    let creator: UGCCreatorJob
    let height: CGFloat
    let columnWidth: CGFloat
    let onTap: () -> Void

    private let cornerRadius: CGFloat = 12

    var body: some View {
        Button(action: onTap) {
            tileMedia
                .frame(width: columnWidth, height: height)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var tileMedia: some View {
        if let videoURL = creator.videoURL.flatMap(URL.init(string:)) {
            LoopingVideoView(url: videoURL, isActive: true, muted: true, aspectFill: true)
        } else if let thumbURL = creator.thumbnailURL.flatMap(URL.init(string:)) {
            AsyncImage(url: thumbURL) { phase in
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
}

// MARK: - Full-screen library reel (from grid)

struct UGCLibraryReelDetailView: View {
    let creator: UGCCreatorJob
    var onBack: () -> Void
    var onUse: () -> Void

    @State private var muted = true

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                UGCLibraryCard(
                    creator: creator,
                    isActive: true,
                    muted: muted,
                    edgeToEdge: true,
                    onToggleMute: { muted.toggle() },
                    onUse: onUse
                )
                .frame(width: geo.size.width, height: geo.size.height)

                VStack {
                    HStack {
                        Button(action: onBack) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(Circle().fill(Color.black.opacity(0.45)))
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    Spacer()
                }
                .safeAreaPadding(.top, 4)
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
    }
}
