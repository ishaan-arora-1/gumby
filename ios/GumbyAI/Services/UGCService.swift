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

    // MARK: - AI script

    struct ScriptRequest {
        let productName: String
        let productDescription: String
        let template: UGCTemplate
        let tone: String
        /// How many seconds of spoken voice-over to target. Defaults to 10
        /// — Kling 3.0 Pro renders 5s or 10s clips.
        var targetSeconds: Int = 10
    }

    func generateScript(_ req: ScriptRequest) async throws -> String {
        let body: [String: Any] = [
            "productName": req.productName,
            "productDescription": req.productDescription,
            "tone": req.tone,
            "targetSeconds": req.targetSeconds,
            "template": [
                "name": req.template.name,
                "actor_name": req.template.actorName,
                "setting": req.template.setting,
                "sample_script": req.template.sampleScript,
                "duration_seconds": req.template.durationSeconds,
            ],
        ]
        struct ScriptPayload: Codable { let script: String }
        let resp: APIResponse<ScriptPayload> = try await api.post(path: "/ugc/script", body: body)
        return resp.data?.script ?? ""
    }

    // MARK: - Prompt parsing (direct mode)

    struct ParsedPrompt: Codable {
        let creatorDescription: String
        let productName: String
        let productDescription: String
        let videoDescription: String
        let suggestedDuration: Int
        let includeProduct: Bool
    }

    func parsePrompt(_ prompt: String) async throws -> ParsedPrompt {
        let body: [String: Any] = ["prompt": prompt]
        let resp: APIResponse<ParsedPrompt> = try await api.post(path: "/ugc/parse-prompt", body: body)
        guard let data = resp.data else { throw APIError.noData }
        return data
    }

    // MARK: - Generation

    struct GenerateRequest {
        /// Template ID — nil in direct mode (user describes creator inline).
        let templateId: String?
        /// Creator appearance description — used only in direct mode when
        /// templateId is nil.
        let creatorDescription: String?
        /// Optional template-mode tweaks (e.g. "same person but on a
        /// beach"). The backend keeps the template creator's identity
        /// locked and applies these adjustments to the surrounding scene
        /// in the Nano Banana seed-image pass. Ignored in direct mode.
        let creatorTweaks: String?
        let productName: String
        let productDescription: String
        let productImageURL: String?
        /// Optional inspiration photo describing the *scene* the user wants.
        /// The backend reimagines this image with a new model (Nano Banana
        /// Pro) and uses the result as the seed frame for the Kling 3.0 Pro
        /// image-to-video call.
        let inspirationImageURL: String?
        let script: String
        /// Full video description — passed straight to Kling 3.0 Pro as the
        /// action prompt. Single-shot generation, audio + lip-sync inline.
        let videoDescription: String
        /// Target video duration: 5 or 10 seconds (Kling 3.0 Pro enum).
        let videoDuration: Int
    }

    func startGeneration(_ req: GenerateRequest) async throws -> UGCJob {
        var body: [String: Any] = [
            "productName": req.productName,
            "productDescription": req.productDescription,
            "script": req.script,
            "videoDuration": req.videoDuration,
        ]
        if let id = req.templateId { body["templateId"] = id }
        if let desc = req.creatorDescription, !desc.isEmpty { body["creatorDescription"] = desc }
        if let tweaks = req.creatorTweaks, !tweaks.isEmpty { body["creatorTweaks"] = tweaks }
        if let url = req.productImageURL { body["productImageUrl"] = url }
        if let url = req.inspirationImageURL, !url.isEmpty { body["inspirationImageUrl"] = url }
        if !req.videoDescription.isEmpty {
            body["videoDescription"] = req.videoDescription
        }
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

    // MARK: - Standalone creator generation (text-to-video)

    struct CreatorRequest {
        let prompt: String
        let aspectRatio: String
        let durationSeconds: Int
    }

    func startCreatorGeneration(_ req: CreatorRequest) async throws -> UGCCreatorJob {
        let body: [String: Any] = [
            "prompt": req.prompt,
            "aspectRatio": req.aspectRatio,
            "durationSeconds": req.durationSeconds,
        ]
        let resp: APIResponse<UGCCreatorJob> = try await api.post(
            path: "/ugc/creator/generate", body: body
        )
        guard let job = resp.data else { throw APIError.noData }
        return job
    }

    func fetchCreatorJob(id: String) async throws -> UGCCreatorJob {
        let resp: APIResponse<UGCCreatorJob> = try await api.get(
            path: "/ugc/creator/jobs/\(id)"
        )
        guard let job = resp.data else { throw APIError.noData }
        return job
    }

    func fetchCreatorJobs(page: Int = 1) async throws -> [UGCCreatorJob] {
        let resp: PaginatedResponse<UGCCreatorJob> = try await api.get(
            path: "/ugc/creator/jobs?page=\(page)"
        )
        return resp.data
    }

    func fetchLibrary(page: Int = 1) async throws -> [UGCCreatorJob] {
        let resp: PaginatedResponse<UGCCreatorJob> = try await api.get(
            path: "/ugc/library?page=\(page)"
        )
        return resp.data
    }

    func deleteCreatorJob(id: String) async throws {
        try await api.delete(path: "/ugc/creator/jobs/\(id)")
    }

    func promoteCreatorToTemplate(
        jobId: String,
        actorName: String? = nil,
        sampleScript: String? = nil
    ) async throws -> UGCTemplate {
        var body: [String: Any] = [:]
        if let n = actorName, !n.isEmpty { body["actorName"] = n }
        if let s = sampleScript, !s.isEmpty { body["sampleScript"] = s }
        let resp: APIResponse<UGCTemplate> = try await api.post(
            path: "/ugc/creator/jobs/\(jobId)/promote-to-template",
            body: body
        )
        guard let tpl = resp.data else { throw APIError.noData }
        return tpl
    }

    // MARK: - Image uploads

    func uploadProductImage(_ image: UIImage) async throws -> String {
        try await uploadImage(image, path: "/ugc/upload-product-image")
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
