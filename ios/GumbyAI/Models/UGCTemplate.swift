import Foundation

struct UGCTemplate: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let actorName: String
    let actorAvatarURL: String?
    let description: String
    let setting: String
    let videoURL: String
    let thumbnailURL: String
    let sampleScript: String
    let voiceId: String
    let aspectRatio: String
    let durationSeconds: Int
    let tags: [String]?
    let category: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case actorName = "actor_name"
        case actorAvatarURL = "actor_avatar_url"
        case description, setting
        case videoURL = "video_url"
        case thumbnailURL = "thumbnail_url"
        case sampleScript = "sample_script"
        case voiceId = "voice_id"
        case aspectRatio = "aspect_ratio"
        case durationSeconds = "duration_seconds"
        case tags, category
    }
}

