import Foundation
import UIKit

class ImageUploadService {
    static let shared = ImageUploadService()

    func uploadImage(_ image: UIImage, bucket: String = "chat-images") async throws -> String {
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            throw APIError.custom("Failed to compress image")
        }

        let supabaseURL = AppConstants.supabaseURL
        let userId = AuthService.shared.getUserId() ?? "unknown"
        let fileName = "\(UUID().uuidString).jpg"
        let path = "\(userId)/\(fileName)"

        guard let url = URL(string: "\(supabaseURL)/storage/v1/object/\(bucket)/\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConstants.supabaseAnonKey, forHTTPHeaderField: "apikey")

        if let token = AuthService.shared.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = imageData

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }

        return "\(supabaseURL)/storage/v1/object/public/\(bucket)/\(path)"
    }

    func uploadImages(_ images: [UIImage]) async throws -> [String] {
        var urls: [String] = []
        for image in images {
            let url = try await uploadImage(image)
            urls.append(url)
        }
        return urls
    }
}
