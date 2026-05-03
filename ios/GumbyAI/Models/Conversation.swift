import Foundation

struct Conversation: Codable, Identifiable {
    let id: String
    let userID: String
    let title: String
    let createdAt: Date?
    var lastMessage: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case title
        case createdAt = "created_at"
        case lastMessage = "last_message"
    }
}
