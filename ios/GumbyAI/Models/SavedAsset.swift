import Foundation

struct SavedAsset: Codable, Identifiable {
    let id: String
    let userID: String
    let assetType: AssetType
    let assetID: String
    let assetURL: String
    let createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case assetType = "asset_type"
        case assetID = "asset_id"
        case assetURL = "asset_url"
        case createdAt = "created_at"
    }
}

enum AssetType: String, Codable {
    case model
    case moodboard
    case image
}
