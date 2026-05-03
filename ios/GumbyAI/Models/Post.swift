import Foundation

struct Post: Codable, Identifiable {
    let id: String
    var userID: String
    var content: String
    var imageURLs: [String]?
    var scheduledDate: Date
    var platform: Platform
    var status: PostStatus
    let createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case content
        case imageURLs = "image_urls"
        case scheduledDate = "scheduled_date"
        case platform, status
        case createdAt = "created_at"
    }
}

enum Platform: String, Codable, CaseIterable {
    case instagram = "instagram"
    case twitter = "twitter"
    case linkedin = "linkedin"
    case tiktok = "tiktok"
    case facebook = "facebook"
    
    var displayName: String {
        switch self {
        case .instagram: return "Instagram"
        case .twitter: return "Twitter"
        case .linkedin: return "LinkedIn"
        case .tiktok: return "TikTok"
        case .facebook: return "Facebook"
        }
    }
    
    var iconName: String {
        switch self {
        case .instagram: return "camera"
        case .twitter: return "bird"
        case .linkedin: return "briefcase"
        case .tiktok: return "music.note"
        case .facebook: return "person.2"
        }
    }
}

enum PostStatus: String, Codable {
    case planned
    case posted
}
