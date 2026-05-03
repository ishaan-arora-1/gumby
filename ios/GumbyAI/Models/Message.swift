import Foundation

struct Message: Codable, Identifiable {
    let id: String
    let conversationID: String
    let role: MessageRole
    let content: String
    let imageURLs: [String]?
    let createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case conversationID = "conversation_id"
        case role, content
        case imageURLs = "image_urls"
        case createdAt = "created_at"
    }
}

enum MessageRole: String, Codable {
    case user
    case assistant
}
