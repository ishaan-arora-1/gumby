import Foundation

struct User: Codable, Identifiable {
    let id: String
    /// Supabase / Apple may omit this (e.g. declined email scope or relay edge cases).
    let email: String?
    let name: String
    let avatarURL: String?
    let createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id, email, name
        case avatarURL = "avatar_url"
        case createdAt = "created_at"
    }
}
