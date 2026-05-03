import SwiftUI

struct LibrarySheetView: View {
    @EnvironmentObject var libraryVM: LibraryViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppConstants.backgroundColor.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    filterBar
                    assetsGrid
                }
            }
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundColor(AppConstants.textSecondary)
                }
            }
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task {
            await libraryVM.loadAssets()
        }
    }
    
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(LibraryViewModel.AssetFilter.allCases, id: \.self) { filter in
                    Button(action: {
                        libraryVM.selectedFilter = filter
                        Task { await libraryVM.loadAssets() }
                    }) {
                        Text(filter.rawValue)
                            .font(.subheadline)
                            .fontWeight(libraryVM.selectedFilter == filter ? .semibold : .regular)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                libraryVM.selectedFilter == filter ?
                                    AnyShapeStyle(AppConstants.accentGradient) :
                                    AnyShapeStyle(AppConstants.surfaceColor)
                            )
                            .foregroundColor(libraryVM.selectedFilter == filter ? .white : AppConstants.textSecondary)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }
    
    private var assetsGrid: some View {
        ScrollView {
            if libraryVM.assets.isEmpty && !libraryVM.isLoading {
                VStack(spacing: 16) {
                    Image(systemName: "folder")
                        .font(.system(size: 48))
                        .foregroundColor(AppConstants.textSecondary)
                    Text("No saved assets")
                        .font(.subheadline)
                        .foregroundColor(AppConstants.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
            } else {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ], spacing: 8) {
                    ForEach(libraryVM.assets) { asset in
                        AssetGridItem(asset: asset) {
                            chatVM.attachAsset(url: asset.assetURL)
                            dismiss()
                        }
                        .onAppear {
                            if asset.id == libraryVM.assets.last?.id {
                                Task { await libraryVM.loadMore() }
                            }
                        }
                    }
                }
                .padding(16)
            }
            
            if libraryVM.isLoading {
                ProgressView().tint(.white).padding()
            }
        }
    }
}

struct AssetGridItem: View {
    let asset: SavedAsset
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            AsyncImage(url: URL(string: asset.assetURL)) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                RoundedRectangle(cornerRadius: 8)
                    .fill(AppConstants.surfaceColor)
                    .overlay(ProgressView().tint(.white))
            }
            .frame(height: 110)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .bottomLeading) {
                Text(asset.assetType.rawValue)
                    .font(.system(size: 9))
                    .fontWeight(.semibold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                    .padding(6)
            }
        }
    }
}
