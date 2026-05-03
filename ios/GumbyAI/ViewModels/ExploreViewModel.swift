import SwiftUI

@MainActor
class ExploreViewModel: ObservableObject {
    @Published var models: [ExploreModel] = []
    @Published var moodboards: [MoodBoard] = []
    @Published var selectedTab: ExploreTab = .models
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentPage = 1
    @Published var totalPages = 1
    @Published var selectedModel: ExploreModel?
    @Published var selectedMoodBoard: MoodBoard?
    @Published var showModelDetail = false
    @Published var showMoodBoardDetail = false
    
    private let apiService = APIService.shared
    
    enum ExploreTab: String, CaseIterable {
        case models = "Models"
        case moodboards = "Mood Boards"
        case templates = "Templates"
    }
    
    func loadModels(page: Int = 1) async {
        isLoading = true
        do {
            let response: PaginatedResponse<ExploreModel> = try await apiService.get(
                path: "/explore/models?page=\(page)"
            )
            if page == 1 {
                models = response.data
            } else {
                models.append(contentsOf: response.data)
            }
            currentPage = response.page
            totalPages = response.totalPages
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func loadMoodBoards(page: Int = 1) async {
        isLoading = true
        do {
            let response: PaginatedResponse<MoodBoard> = try await apiService.get(
                path: "/explore/moodboards?page=\(page)"
            )
            if page == 1 {
                moodboards = response.data
            } else {
                moodboards.append(contentsOf: response.data)
            }
            currentPage = response.page
            totalPages = response.totalPages
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func loadMore() async {
        guard currentPage < totalPages else { return }
        let nextPage = currentPage + 1
        switch selectedTab {
        case .models:
            await loadModels(page: nextPage)
        case .moodboards:
            await loadMoodBoards(page: nextPage)
        case .templates:
            break
        }
    }
    
    func selectModel(_ model: ExploreModel) {
        selectedModel = model
        showModelDetail = true
    }
    
    func selectMoodBoard(_ board: MoodBoard) {
        selectedMoodBoard = board
        showMoodBoardDetail = true
    }
}
