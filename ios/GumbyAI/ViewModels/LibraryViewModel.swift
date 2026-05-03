import SwiftUI

@MainActor
class LibraryViewModel: ObservableObject {
    @Published var assets: [SavedAsset] = []
    @Published var selectedFilter: AssetFilter = .all
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentPage = 1
    @Published var totalPages = 1
    
    private let apiService = APIService.shared
    
    enum AssetFilter: String, CaseIterable {
        case all = "All"
        case model = "Models"
        case moodboard = "Mood Boards"
        case image = "Images"

        var queryValue: String {
            switch self {
            case .all: return "all"
            case .model: return "model"
            case .moodboard: return "moodboard"
            case .image: return "image"
            }
        }
    }

    func loadAssets(page: Int = 1) async {
        isLoading = true
        let typeParam = selectedFilter == .all ? "" : "&type=\(selectedFilter.queryValue)"
        
        do {
            let response: PaginatedResponse<SavedAsset> = try await apiService.get(
                path: "/library?page=\(page)\(typeParam)"
            )
            if page == 1 {
                assets = response.data
            } else {
                assets.append(contentsOf: response.data)
            }
            currentPage = response.page
            totalPages = response.totalPages
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func saveAsset(type: AssetType, id: String, url: String) async {
        let body: [String: Any] = [
            "assetType": type.rawValue,
            "assetId": id,
            "assetUrl": url
        ]
        
        do {
            let response: APIResponse<SavedAsset> = try await apiService.post(
                path: "/library",
                body: body
            )
            if let asset = response.data {
                assets.insert(asset, at: 0)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    func deleteAsset(_ asset: SavedAsset) async {
        do {
            try await apiService.delete(path: "/library/\(asset.id)")
            assets.removeAll { $0.id == asset.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    func loadMore() async {
        guard currentPage < totalPages else { return }
        await loadAssets(page: currentPage + 1)
    }
}
