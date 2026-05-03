import Foundation

struct MoodBoard: Codable, Identifiable {
    let id: String
    let title: String
    let coverURL: String
    let imageURLs: [String]
    let category: String
    let tags: [String]?
    
    enum CodingKeys: String, CodingKey {
        case id, title
        case coverURL = "cover_url"
        case imageURLs = "image_urls"
        case category, tags
    }
}
