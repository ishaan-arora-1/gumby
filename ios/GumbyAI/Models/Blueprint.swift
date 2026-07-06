import Foundation

/// Curated "viral format" blueprint — a locked prompt recipe where the user
/// only supplies a product photo. Mirrors web's `Blueprint` in
/// `web/lib/types.ts`; display metadata only, the prompt recipes stay
/// server-side (`GET /ugc/blueprints`).
struct Blueprint: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let tagline: String
    let format: String
    let hasCreator: Bool
    let creatorSpeaks: Bool
    let durationSeconds: Int
    let aspectRatio: String
    /// Two hex colors (e.g. "#f97316") for the card's gradient cover, used
    /// until/unless a preview video exists.
    let accent: [String]
    let sortOrder: Int
    let previewVideoURL: String?
    let previewPosterURL: String?

    enum CodingKeys: String, CodingKey {
        case id, name, tagline, format, accent
        case hasCreator = "has_creator"
        case creatorSpeaks = "creator_speaks"
        case durationSeconds = "duration_seconds"
        case aspectRatio = "aspect_ratio"
        case sortOrder = "sort_order"
        case previewVideoURL = "preview_video_url"
        case previewPosterURL = "preview_poster_url"
    }
}
