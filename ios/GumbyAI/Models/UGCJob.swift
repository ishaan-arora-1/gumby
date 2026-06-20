import Foundation

enum UGCJobStatus: String, Codable {
    case queued
    // Single-shot pipeline statuses
    case planning
    case preparing
    case renderingScene    = "rendering_scene"      // Nano Banana subject swap / product integration
    case generatingVideo   = "generating_video"     // Kling 3.0 Pro single-shot generation (audio + lip-sync inline)
    case finalizing
    // Legacy statuses kept for decoding old job rows
    case tts
    case lipsync
    case generatingScenes  = "generating_scenes"
    case stitching
    case broll
    // Terminal
    case completed
    case failed

    var displayLabel: String {
        switch self {
        case .queued: return "Queued"
        case .planning: return "Planning"
        case .preparing: return "Preparing"
        case .renderingScene: return "Building scene"
        case .generatingVideo: return "Generating video"
        case .generatingScenes: return "Generating scenes"
        case .stitching: return "Stitching video"
        case .tts: return "Voicing"
        case .lipsync: return "Lip-syncing"
        case .broll: return "B-roll"
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
    let templateId: String?
    let templateSnapshot: TemplateSnapshot?

    let productName: String
    let productImageURL: String?
    let productDescription: String

    let script: String

    let status: UGCJobStatus
    let progress: Int
    let error: String?

    let outputVideoURL: String?
    let outputThumbnailURL: String?

    /// Optional brief fields used by the History detail view to recap
    /// what the user filled in. Decoded as optional so older job rows
    /// without these columns still parse cleanly.
    let videoDescription: String?
    let videoDuration: Int?

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
        case status, progress, error
        case outputVideoURL = "output_video_url"
        case outputThumbnailURL = "output_thumbnail_url"
        case videoDescription = "video_description"
        case videoDuration = "video_duration"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case createdAt = "created_at"
    }

    /// A human-readable name for the job, always non-empty — used for the
    /// sidebar Recents, History cards, and the detail title so nothing ever
    /// reads "Untitled". Falls back through the most descriptive field
    /// available, then a dated label.
    var displayTitle: String {
        let name = productName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { return name }
        if let t = templateSnapshot?.name?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return t }
        if let a = templateSnapshot?.actorName?.trimmingCharacters(in: .whitespacesAndNewlines), !a.isEmpty { return a }
        if let s = Self.snippet(from: script) { return s }
        if let s = Self.snippet(from: productDescription) { return s }
        if let s = Self.snippet(from: videoDescription ?? "") { return s }
        if let date = createdAt {
            let f = DateFormatter()
            f.dateFormat = "MMM d"
            return "Ad · \(f.string(from: date))"
        }
        return "New ad"
    }

    /// First few words of `text`, trimmed to a tidy title length.
    private static func snippet(from text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let words = trimmed.split(whereSeparator: { $0 == " " || $0.isNewline }).prefix(6)
        var s = words.joined(separator: " ")
        if s.count > 40 { s = String(s.prefix(40)).trimmingCharacters(in: .whitespaces) + "…" }
        return s
    }

    struct TemplateSnapshot: Codable, Hashable {
        let name: String?
        let actorName: String?
        let setting: String?
        let videoURL: String?
        let thumbnailURL: String?
        let aspectRatio: String?
        let durationSeconds: Int?

        // Optional snapshot extras — same no-migration pattern the
        // backend uses to stash per-job settings without adding columns.
        let userTweaks: String?
        let userEthnicity: String?
        let captionsEnabled: Bool?
        let captionPreset: String?

        enum CodingKeys: String, CodingKey {
            case name
            case actorName = "actor_name"
            case setting
            case videoURL = "video_url"
            case thumbnailURL = "thumbnail_url"
            case aspectRatio = "aspect_ratio"
            case durationSeconds = "duration_seconds"
            case userTweaks = "user_tweaks"
            case userEthnicity = "user_ethnicity"
            case captionsEnabled = "captions_enabled"
            case captionPreset = "caption_preset"
        }
    }
}
