import Foundation

enum UGCJobStatus: String, Codable {
    case queued
    case tts
    case lipsync
    case finalizing
    case completed
    case failed

    var displayLabel: String {
        switch self {
        case .queued: return "Queued"
        case .tts: return "Voicing"
        case .lipsync: return "Lip-syncing"
        case .finalizing: return "Finalizing"
        case .completed: return "Ready"
        case .failed: return "Failed"
        }
    }

    var isTerminal: Bool { self == .completed || self == .failed }
}

struct UGCJob: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let templateId: String
    let templateSnapshot: TemplateSnapshot?

    let productName: String
    let productImageURL: String?
    let productDescription: String

    let script: String
    let voiceId: String

    let status: UGCJobStatus
    let progress: Int
    let error: String?

    let audioURL: String?
    let outputVideoURL: String?
    let outputThumbnailURL: String?

    let startedAt: Date?
    let completedAt: Date?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case templateId = "template_id"
        case templateSnapshot = "template_snapshot"
        case productName = "product_name"
        case productImageURL = "product_image_url"
        case productDescription = "product_description"
        case script
        case voiceId = "voice_id"
        case status, progress, error
        case audioURL = "audio_url"
        case outputVideoURL = "output_video_url"
        case outputThumbnailURL = "output_thumbnail_url"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case createdAt = "created_at"
    }

    struct TemplateSnapshot: Codable, Hashable {
        let name: String?
        let actorName: String?
        let setting: String?
        let videoURL: String?
        let thumbnailURL: String?
        let aspectRatio: String?
        let durationSeconds: Int?

        enum CodingKeys: String, CodingKey {
            case name
            case actorName = "actor_name"
            case setting
            case videoURL = "video_url"
            case thumbnailURL = "thumbnail_url"
            case aspectRatio = "aspect_ratio"
            case durationSeconds = "duration_seconds"
        }
    }
}
