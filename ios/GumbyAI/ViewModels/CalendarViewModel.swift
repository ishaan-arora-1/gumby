import SwiftUI

@MainActor
class CalendarViewModel: ObservableObject {
    @Published var posts: [Post] = []
    @Published var selectedDate = Date()
    @Published var currentMonth = Date()
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showNewPostSheet = false
    
    @Published var newPostContent = ""
    @Published var newPostDate = Date()
    @Published var newPostPlatform: Platform = .instagram
    @Published var newPostImages: [String] = []
    
    private let apiService = APIService.shared
    
    var postsForSelectedDate: [Post] {
        let calendar = Calendar.current
        return posts.filter { calendar.isDate($0.scheduledDate, inSameDayAs: selectedDate) }
    }
    
    var datesWithPosts: Set<String> {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return Set(posts.map { formatter.string(from: $0.scheduledDate) })
    }
    
    func loadPosts() async {
        isLoading = true
        let calendar = Calendar.current
        let month = calendar.component(.month, from: currentMonth)
        let year = calendar.component(.year, from: currentMonth)
        
        do {
            let response: APIResponse<[Post]> = try await apiService.get(
                path: "/calendar?month=\(month)&year=\(year)"
            )
            if let data = response.data {
                posts = data
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func createPost() async {
        guard !newPostContent.isEmpty else { return }
        isLoading = true
        
        let formatter = ISO8601DateFormatter()
        let body: [String: Any] = [
            "content": newPostContent,
            "scheduledDate": formatter.string(from: newPostDate),
            "platform": newPostPlatform.rawValue,
            "imageUrls": newPostImages
        ]
        
        do {
            let response: APIResponse<Post> = try await apiService.post(path: "/calendar", body: body)
            if let post = response.data {
                posts.append(post)
            }
            resetNewPost()
            showNewPostSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    func deletePost(_ post: Post) async {
        do {
            try await apiService.delete(path: "/calendar/\(post.id)")
            posts.removeAll { $0.id == post.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    func updatePost(_ post: Post) async {
        let formatter = ISO8601DateFormatter()
        let body: [String: Any] = [
            "content": post.content,
            "scheduled_date": formatter.string(from: post.scheduledDate),
            "platform": post.platform.rawValue,
            "status": post.status.rawValue
        ]
        
        do {
            let response: APIResponse<Post> = try await apiService.patch(
                path: "/calendar/\(post.id)",
                body: body
            )
            if let updated = response.data,
               let index = posts.firstIndex(where: { $0.id == post.id }) {
                posts[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    
    private func resetNewPost() {
        newPostContent = ""
        newPostDate = Date()
        newPostPlatform = .instagram
        newPostImages = []
    }
    
    func previousMonth() {
        currentMonth = Calendar.current.date(byAdding: .month, value: -1, to: currentMonth) ?? currentMonth
        Task { await loadPosts() }
    }
    
    func nextMonth() {
        currentMonth = Calendar.current.date(byAdding: .month, value: 1, to: currentMonth) ?? currentMonth
        Task { await loadPosts() }
    }
}
