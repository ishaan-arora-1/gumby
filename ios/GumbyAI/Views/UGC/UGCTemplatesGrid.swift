import SwiftUI

/// Pinterest-style two-column masonry grid of template reels.
struct UGCTemplatesGrid: View {
    @EnvironmentObject var ugcVM: UGCViewModel
    var onSelect: (UGCTemplate) -> Void

    private let columnSpacing: CGFloat = 10
    private let horizontalPadding: CGFloat = 12
    private let tileSpacing: CGFloat = 10
    /// Aspect multipliers for varied tile heights (width × ratio).
    private let heightRatios: [CGFloat] = [1.48, 1.02, 1.62, 0.92, 1.28, 1.14, 1.38, 1.08]

    var body: some View {
        Group {
            if ugcVM.isLoadingTemplates && ugcVM.templates.isEmpty {
                loadingState
            } else if ugcVM.templates.isEmpty {
                emptyState
            } else {
                gridScroll
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
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("No templates yet")
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

    private func masonryColumns(columnWidth: CGFloat) -> (left: [MasonryItem], right: [MasonryItem]) {
        var left: [MasonryItem] = []
        var right: [MasonryItem] = []
        var leftHeight: CGFloat = 0
        var rightHeight: CGFloat = 0

        for (index, template) in ugcVM.templates.enumerated() {
            let ratio = heightRatios[index % heightRatios.count]
            let height = columnWidth * ratio
            let item = MasonryItem(template: template, height: height)

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

    private func masonryColumn(items: [MasonryItem], columnWidth: CGFloat) -> some View {
        VStack(spacing: tileSpacing) {
            ForEach(items) { item in
                GridTile(template: item.template, height: item.height, columnWidth: columnWidth) {
                    onSelect(item.template)
                }
            }
        }
        .frame(width: columnWidth)
    }
}

// MARK: - Masonry tile

private struct MasonryItem: Identifiable {
    let template: UGCTemplate
    let height: CGFloat
    var id: String { template.id }
}

private struct GridTile: View {
    let template: UGCTemplate
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
}

// MARK: - Full-screen reel (from grid)

struct UGCReelDetailView: View {
    let template: UGCTemplate
    var onBack: () -> Void
    var onGenerate: () -> Void

    @State private var muted = true

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black

                UGCFeedCard(
                    template: template,
                    isActive: true,
                    muted: muted,
                    edgeToEdge: true,
                    onToggleMute: { muted.toggle() },
                    onGenerate: onGenerate
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
