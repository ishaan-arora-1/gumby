import Foundation

/// Normalized shape both template kinds collapse to (mirror of web's
/// `lib/templateTarget.ts`), so the preview sheet and the input modal don't
/// care whether the source was a curated blueprint or a featured-creator
/// row. The studio gallery mixes both.
struct TemplateTarget: Identifiable, Hashable {
    enum Kind: String { case blueprint, creator }

    let kind: Kind
    let id: String
    let name: String
    /// Show the script + captions inputs? Silent product-shot blueprints = false.
    let talking: Bool
    let durationSeconds: Int
    let aspectRatio: String
    let videoURL: String?
    let posterURL: String?
    /// Creator-only: the fixed on-camera person composited into the scene.
    let creatorImageURL: String?
    /// Creator-only extras used to seed the script generator's voice.
    let sampleScript: String
    let setting: String

    var credits: Int {
        durationSeconds >= 13 ? 150 : durationSeconds >= 8 ? 100 : 50
    }

    static func from(blueprint b: Blueprint) -> TemplateTarget {
        TemplateTarget(
            kind: .blueprint,
            id: b.id,
            name: b.name,
            talking: b.creatorSpeaks,
            durationSeconds: b.durationSeconds,
            aspectRatio: ["9:16", "16:9"].contains(b.aspectRatio) ? b.aspectRatio : "9:16",
            videoURL: b.previewVideoURL,
            posterURL: b.previewPosterURL,
            creatorImageURL: nil,
            sampleScript: "",
            setting: ""
        )
    }

    static func from(template t: UGCTemplate) -> TemplateTarget {
        let creatorImg = !t.thumbnailURL.isEmpty ? t.thumbnailURL : (t.actorAvatarURL ?? "")
        return TemplateTarget(
            kind: .creator,
            id: t.id,
            name: t.actorName.isEmpty ? t.name : t.actorName,
            talking: true,
            durationSeconds: t.durationSeconds >= 8 ? 10 : (t.durationSeconds > 0 ? t.durationSeconds : 10),
            aspectRatio: ["9:16", "16:9"].contains(t.aspectRatio) ? t.aspectRatio : "9:16",
            videoURL: t.videoURL.isEmpty ? nil : t.videoURL,
            posterURL: t.thumbnailURL.isEmpty ? nil : t.thumbnailURL,
            creatorImageURL: creatorImg.isEmpty ? nil : creatorImg,
            sampleScript: t.sampleScript,
            setting: t.setting
        )
    }
}
