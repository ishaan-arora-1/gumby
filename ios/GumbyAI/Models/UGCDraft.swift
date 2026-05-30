import Foundation
import UIKit
import PhotosUI
import SwiftUI

/// One iteration of the UGC studio — holds every field the user fills in,
/// the generation job (if started), and the output video URL (if completed).
/// The studio view renders an array of these as a stacking Card → Video list.
struct UGCDraft: Identifiable {
    let id: UUID
    var number: Int  // 1-based display label ("Draft 1", "Draft 2", …)

    // MARK: - Creator (direct prompt mode — no template)

    /// When the user skips template selection and describes the creator
    /// directly (e.g. "20-year-old fitness guy in a gym"), this field holds
    /// that description. Empty when a template is used instead.
    var creatorDescription: String

    /// Direct-mode-only ethnicity hint. The backend prepends
    /// "a good-looking <ethnicity> creator — " to the creator context
    /// before feeding it to Nano Banana / Kling. Allowed values mirror
    /// the picker in UGCStudioCard:
    ///   "Asian American", "Indian American", "Asian".
    /// Ignored in template mode.
    var creatorEthnicity: String

    // MARK: - Creator tweaks (template mode only)

    /// Optional adjustments the user wants applied on top of the chosen
    /// template (e.g. "same creator but on a beach"). The backend keeps
    /// the template creator's face/identity locked and applies these
    /// tweaks to the surrounding scene in the Nano Banana seed image
    /// pass. Empty in direct-prompt mode.
    var creatorTweaks: String

    // MARK: - Inspiration image (optional)

    /// Optional reference photo describing the *scene* the user wants for
    /// their creator. When provided, the backend runs it through Nano Banana
    /// Pro to recreate the same scene with a new model (and optionally the
    /// user's product). When omitted, Nano Banana synthesizes a scene purely
    /// from the creator description (+ optional product image) instead.
    /// Either way the result becomes the seed frame for Kling 3.0 Pro.
    var inspirationImage: UIImage?
    var inspirationImageURL: String?
    var inspirationPhotoItem: PhotosPickerItem?

    // MARK: - Product (optional — toggle off for talking-head videos)

    var includeProduct: Bool
    var productName: String
    var productDescription: String
    var productTone: String
    var productImage: UIImage?
    var productImageURL: String?
    var productPhotoItem: PhotosPickerItem?

    // MARK: - Script

    var script: String
    var isGeneratingScript: Bool = false
    var scriptError: String?

    // MARK: - Video description + duration

    var videoDescription: String
    var videoDuration: Int  // 5 or 10 (Kling 3.0 Pro enum)

    // MARK: - Captions

    /// Whether the backend should burn TikTok-style word-by-word captions
    /// into the final video. Defaults to true. The pipeline transcribes
    /// the Kling audio with Whisper, chunks the words into 1–3 word cues,
    /// and renders them in the Instagram Reels safe zone (~76% from top)
    /// via libass.
    var captionsEnabled: Bool

    /// Caption style preset id — see CaptionPreset.all. Defaults to "bold".
    /// Sent to the backend as `captionPreset`; lookup happens against the
    /// shared backend preset config.
    var captionPresetId: String

    // MARK: - Generation

    var status: DraftStatus = .editing
    var job: UGCJob?
    var isSubmitting: Bool = false
    var submitError: String?

    enum DraftStatus: Equatable {
        case editing
        case generating
        case completed
        case failed
    }

    var outputVideoURL: String? {
        job?.outputVideoURL
    }

    var canGenerate: Bool {
        !script.trimmingCharacters(in: .whitespaces).isEmpty &&
        !videoDescription.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Factories

    static func empty(number: Int = 1) -> UGCDraft {
        UGCDraft(
            id: UUID(),
            number: number,
            creatorDescription: "",
            creatorEthnicity: "Indian",
            creatorTweaks: "",
            inspirationImage: nil,
            inspirationImageURL: nil,
            inspirationPhotoItem: nil,
            includeProduct: true,
            productName: "",
            productDescription: "",
            productTone: "",
            productImage: nil,
            productImageURL: nil,
            productPhotoItem: nil,
            script: "",
            videoDescription: "",
            videoDuration: 10,
            captionsEnabled: true,
            captionPresetId: CaptionPreset.defaultId
        )
    }

    static func cloneFrom(_ previous: UGCDraft, number: Int) -> UGCDraft {
        UGCDraft(
            id: UUID(),
            number: number,
            creatorDescription: previous.creatorDescription,
            creatorEthnicity: previous.creatorEthnicity,
            creatorTweaks: previous.creatorTweaks,
            inspirationImage: nil,            // UIImage not cloned; URL carries forward
            inspirationImageURL: previous.inspirationImageURL,
            inspirationPhotoItem: nil,
            includeProduct: previous.includeProduct,
            productName: previous.productName,
            productDescription: previous.productDescription,
            productTone: previous.productTone,
            productImage: nil,  // UIImage not cloned; URL carries forward
            productImageURL: previous.productImageURL,
            productPhotoItem: nil,
            script: previous.script,
            videoDescription: previous.videoDescription,
            videoDuration: previous.videoDuration,
            captionsEnabled: previous.captionsEnabled,
            captionPresetId: previous.captionPresetId
        )
    }
}
