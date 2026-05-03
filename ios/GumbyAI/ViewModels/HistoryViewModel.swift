import SwiftUI

@MainActor
class HistoryViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var currentPage = 1
    @Published var totalPages = 1
    
    private let apiService = APIService.shared
    
    func loadHistory(page: Int = 1) async {
        isLoading = true
        do {
            let response: PaginatedResponse<Conversation> = try await apiService.get(
                path: "/chat/history?page=\(page)"
            )
            if page == 1 {
                conversations = response.data
            } else {
                conversations.append(contentsOf: response.data)
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
        await loadHistory(page: currentPage + 1)
    }
    
    func deleteConversation(_ conversation: Conversation) async {
        do {
            try await apiService.delete(path: "/chat/\(conversation.id)")
            conversations.removeAll { $0.id == conversation.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
