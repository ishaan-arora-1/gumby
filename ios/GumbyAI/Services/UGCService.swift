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

    // MARK: - Voices

    func fetchVoices() async throws -> [UGCVoicePreset] {
        let resp: APIResponse<[UGCVoicePreset]> = try await api.get(path: "/ugc/voices")
        return resp.data ?? []
    }

    // MARK: - AI script

    struct ScriptRequest {
        let productName: String
        let productDescription: String
        let template: UGCTemplate
        let tone: String
    }

    func generateScript(_ req: ScriptRequest) async throws -> String {
        let body: [String: Any] = [
            "productName": req.productName,
            "productDescription": req.productDescription,
            "tone": req.tone,
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

    // MARK: - Generation

    struct GenerateRequest {
        let templateId: String
        let productName: String
        let productDescription: String
        let productImageURL: String?
        let script: String
        let voiceId: String
    }

    func startGeneration(_ req: GenerateRequest) async throws -> UGCJob {
        var body: [String: Any] = [
            "templateId": req.templateId,
            "productName": req.productName,
            "productDescription": req.productDescription,
            "script": req.script,
            "voiceId": req.voiceId,
        ]
        if let url = req.productImageURL { body["productImageUrl"] = url }
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

    // MARK: - Product image upload

    /// Uploads a product image to the backend (which stores it in the
    /// ugc-videos bucket and returns a long-lived signed URL).
    func uploadProductImage(_ image: UIImage) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.85) else {
            throw APIError.custom("Failed to compress image")
        }
        let body: [String: Any] = [
            "contentType": "image/jpeg",
            "base64": data.base64EncodedString(),
        ]
        struct UploadResp: Codable { let url: String? }
        let resp: APIResponse<UploadResp> = try await api.post(path: "/ugc/upload-product-image", body: body)
        guard let url = resp.data?.url else { throw APIError.noData }
        return url
    }
}
