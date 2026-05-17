import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case noData
    case decodingError
    case serverError
    case unauthorized
    case custom(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .noData: return "No data received"
        case .decodingError: return "Failed to decode response"
        case .serverError: return "Server error"
        case .unauthorized: return "Unauthorized"
        case .custom(let message): return message
        }
    }
}

class APIService {
    static let shared = APIService()
    private let baseURL = AppConstants.baseURL

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let isoWithFractional = ISO8601DateFormatter()
        isoWithFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFractional = ISO8601DateFormatter()
        isoNoFractional.formatOptions = [.withInternetDateTime]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let d = isoWithFractional.date(from: raw) { return d }
            if let d = isoNoFractional.date(from: raw) { return d }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unrecognized date format: \(raw)"
            )
        }
        return decoder
    }()

    private func getAuthToken() -> String? {
        AuthService.shared.getToken()
    }

    private func makeRequest(
        path: String,
        method: String = "GET",
        body: [String: Any]? = nil
    ) throws -> URLRequest {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // UGC endpoints return signed URLs that rotate whenever templates are
        // regenerated. Skip the local URLSession cache so the device always
        // pulls the freshest catalog instead of replaying stale signed URLs.
        if path.hasPrefix("/ugc") {
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        }

        if let token = getAuthToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        return request
    }

    func get<T: Codable>(path: String) async throws -> T {
        let request = try makeRequest(path: path)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }

        return try decoder.decode(T.self, from: data)
    }

    func post<T: Codable>(path: String, body: [String: Any]) async throws -> T {
        let request = try makeRequest(path: path, method: "POST", body: body)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }

        return try decoder.decode(T.self, from: data)
    }

    func patch<T: Codable>(path: String, body: [String: Any]) async throws -> T {
        let request = try makeRequest(path: path, method: "PATCH", body: body)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }

        return try decoder.decode(T.self, from: data)
    }

    func delete(path: String) async throws {
        let request = try makeRequest(path: path, method: "DELETE")
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError
        }
    }
}
