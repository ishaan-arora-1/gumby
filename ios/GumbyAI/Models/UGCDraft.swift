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
            videoDuration: 10
        )
    }

    static func cloneFrom(_ previous: UGCDraft, number: Int) -> UGCDraft {
        UGCDraft(
            id: UUID(),
            number: number,
            creatorDescription: previous.creatorDescription,
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
            videoDuration: previous.videoDuration
        )
    }
}
