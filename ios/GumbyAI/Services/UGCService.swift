import Foundation
import UIKit

/// Thin wrapper around the /api/ugc endpoints for the iOS client.
final class UGCService {
    static let shared = UGCService()
    private let api = APIService.shared

    // MARK: - Templates

    func fetchTemplates(page: Int = 1, category: String? = nil) async throws -> [UGCTemplate] {
        var path = "/ugc/templates?page=\(page)"
        if let category, !category.isEmpty {
            path += "&category=\(category.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? category)"
        }
        let resp: PaginatedResponse<UGCTemplate> = try await api.get(path: path)
        return resp.data
    }

    func fetchTemplate(id: String) async throws -> UGCTemplate {
        let resp: APIResponse<UGCTemplate> = try await api.get(path: "/ugc/templates/\(id)")
        guard let data = resp.data else { throw APIError.noData }
        return data
    }

    // MARK: - AI script (unified)

    /// Draft a script from the free-form prompt — mirrors web StudioForm's
    /// `generateScriptAI()`, which posts a synthetic "unified" template and
    /// the prompt (capped at 800 chars) as the product description.
    func generateScriptUnified(prompt: String, targetSeconds: Int) async throws -> String {
        let body: [String: Any] = [
            "productName": "",
            "productDescription": String(prompt.prefix(800)),
            "targetSeconds": targetSeconds,
            "template": [
                "name": "unified",
                "actor_name": "Creator",
                "setting": "as described in the user prompt",
                "sample_script": "",
            ],
        ]
        struct ScriptPayload: Codable { let script: String }
        let resp: APIResponse<ScriptPayload> = try await api.post(path: "/ugc/script", body: body)
        return resp.data?.script ?? ""
    }

    // MARK: - Generation (unified free-form)
    //
    // 1:1 with web's `api.generateAd()` → `POST /ugc/generate`. One prompt,
    // a flat list of reference image URLs (the backend classifies each
    // image's role itself), an optional fixed creator image (from a
    // template / history item), plus finishing options.

    struct AdRequest {
        let prompt: String
        let attachmentUrls: [String]
        /// Known creator image from a template / history item. Role is fixed
        /// to "creator" on the backend; the rest of attachmentUrls are
        /// classified.
        let creatorImageUrl: String?
        let script: String
        let creatorSpeaks: Bool
        let videoDuration: Int          // 5 or 10
        let aspectRatio: String         // 9:16 / 16:9 / 1:1
        let captionsEnabled: Bool
        let captionPresetId: String?
    }

    func startAdGeneration(_ req: AdRequest) async throws -> UGCJob {
        var body: [String: Any] = [
            "prompt": req.prompt,
            "attachmentUrls": req.attachmentUrls,
            "script": req.script,
            "creatorSpeaks": req.creatorSpeaks,
            "videoDuration": req.videoDuration,
            "aspectRatio": req.aspectRatio,
            "captionsEnabled": req.captionsEnabled,
        ]
        if let c = req.creatorImageUrl, !c.isEmpty { body["creatorImageUrl"] = c }
        if let p = req.captionPresetId, !p.isEmpty { body["captionPreset"] = p }
        let resp: APIResponse<UGCJob> = try await api.post(path: "/ugc/generate", body: body)
        guard let job = resp.data else { throw APIError.noData }
        return job
    }

    // MARK: - Jobs

    func fetchJobs(page: Int = 1) async throws -> [UGCJob] {
        let resp: PaginatedResponse<UGCJob> = try await api.get(path: "/ugc/jobs?page=\(page)")
        return resp.data
    }

    func fetchJob(id: String) async throws -> UGCJob {
        let resp: APIResponse<UGCJob> = try await api.get(path: "/ugc/jobs/\(id)")
        guard let job = resp.data else { throw APIError.noData }
        return job
    }

    func deleteJob(id: String) async throws {
        try await api.delete(path: "/ugc/jobs/\(id)")
    }

    /// Reuse a completed UGC job as a template.
    ///
    /// Server mints a hidden `ugc_templates` row pointing at the job's
    /// `output_video_url`. The existing template flow then handles the
    /// rest — seed-frame extraction, product integration, Kling 3.0 Pro
    /// generation. Returned template can be fed straight into
    /// `chatVM.pickTemplate(_:)`.
    func useHistoryItem(jobId: String) async throws -> UGCTemplate {
        let resp: APIResponse<UGCTemplate> = try await api.post(
            path: "/ugc/jobs/\(jobId)/use",
            body: [:]
        )
        guard let tpl = resp.data else { throw APIError.noData }
        return tpl
    }

    // MARK: - Image uploads

    func uploadProductImage(_ image: UIImage) async throws -> String {
        try await uploadImage(image, path: "/ugc/upload-product-image")
    }

    func uploadAttachment(_ image: UIImage) async throws -> String {
        try await uploadImage(image, path: "/ugc/upload-attachment")
    }

    func uploadInspirationImage(_ image: UIImage) async throws -> String {
        try await uploadImage(image, path: "/ugc/upload-inspiration-image")
    }

    private func uploadImage(_ image: UIImage, path: String) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            throw APIError.custom("Failed to compress image")
        }
        let body: [String: Any] = [
            "contentType": "image/jpeg",
            "base64": data.base64EncodedString(),
        ]
        struct UploadResp: Codable { let url: String? }
        let resp: APIResponse<UploadResp> = try await api.post(path: path, body: body)
        guard let url = resp.data?.url else { throw APIError.noData }
        return url
    }
}
