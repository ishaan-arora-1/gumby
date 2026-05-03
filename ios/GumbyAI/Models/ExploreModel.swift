import Foundation

struct ExploreModel: Codable, Identifiable {
    let id: String
    let name: String
    let pose: String
    let imageURL: String
    let tags: [String]?
    
    enum CodingKeys: String, CodingKey {
        case id, name, pose
        case imageURL = "image_url"
        case tags
    }
}
