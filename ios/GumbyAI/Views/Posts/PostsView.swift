import SwiftUI

/// Gallery of assistant-generated images (three columns; scrolls for more than nine items).
struct PostsView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @ObservedObject private var generatedImages = GeneratedImagesStore.shared

    private let gridSpacing: CGFloat = 6

    private var gridColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: gridSpacing),
            GridItem(.flexible(), spacing: gridSpacing),
            GridItem(.flexible(), spacing: gridSpacing)
        ]
    }

    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                if generatedImages.items.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                            ForEach(generatedImages.items) { item in
                                cell(for: item)
                            }
                        }
                        .padding(16)
                    }
                }
            }
        }
    }

    private var header: some View {
        HStack {
            Button(action: { sidebarVM.toggle() }) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }

            Spacer()

            Text("Posts")
                .font(.headline)
                .foregroundColor(AppConstants.textPrimary)

            Spacer()

            Color.clear.frame(width: 28, height: 28)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "photo.on.rectangle.angled")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("No generated images yet")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(AppConstants.textPrimary)
            Text("Create images in chat — they’ll show up here.")
                .font(.subheadline)
                .foregroundColor(AppConstants.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    private func cell(for item: GeneratedImagesStore.Item) -> some View {
        Button {
            RemoteImagePreviewController.shared.present(urlString: item.url)
        } label: {
            GeometryReader { geo in
                let side = geo.size.width
                AsyncImage(url: URL(string: item.url)) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius)
                        .fill(AppConstants.surfaceColor)
                        .overlay(ProgressView().tint(.white))
                }
                .frame(width: side, height: side)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius))
            }
            .aspectRatio(1, contentMode: .fit)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    PostsView()
        .environmentObject(SidebarViewModel())
}
