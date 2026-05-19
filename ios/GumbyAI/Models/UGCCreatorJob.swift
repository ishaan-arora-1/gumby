import Foundation

/// Standalone "creator" generation job — the user types a prompt describing
/// an on-camera persona ("early 20s girl in a sunlit bedroom showing off a
/// hoodie") and the backend produces a 5-10s silent clip via Kling 2.6 Pro
/// text-to-video.
///
/// This sits *before* the lip-sync pipeline and is optional — if the user is
/// happy with the silent creator clip alone (flow C in the chat funnel) they
/// can stop here. Otherwise the job gets promoted into a hidden `UGCTemplate`
/// row that flows into the existing /ugc/generate pipeline (flow B).
enum UGCCreatorJobStatus: String, Codable {
    case queued
    case generating
    case completed
    case failed

    var displayLabel: String {
        switch self {
        case .queued: return "Queued"
        case .generating: return "Generating"
        case .completed: return "Ready"
        case .failed: return "Failed"
        }
    }

    var isTerminal: Bool { self == .completed || self == .failed }
}

struct UGCCreatorJob: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let prompt: String
    let aspectRatio: String?
    let durationSeconds: Int?
    let status: UGCCreatorJobStatus
    let progress: Int
    let error: String?
    let videoURL: String?
    let thumbnailURL: String?
    let templateId: String?
    let startedAt: Date?
    let completedAt: Date?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case prompt
        case aspectRatio = "aspect_ratio"
        case durationSeconds = "duration_seconds"
        case status, progress, error
        case videoURL = "video_url"
        case thumbnailURL = "thumbnail_url"
        case templateId = "template_id"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case createdAt = "created_at"
    }
}
