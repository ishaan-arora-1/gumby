import Foundation

struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let error: String?
}

struct PaginatedResponse<T: Codable>: Codable {
    let data: [T]
    let page: Int
    let totalPages: Int
    let totalCount: Int
    
    enum CodingKeys: String, CodingKey {
        case data, page
        case totalPages = "total_pages"
        case totalCount = "total_count"
    }
}
