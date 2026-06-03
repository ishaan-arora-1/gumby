import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case noData
    case decodingError
    case serverError
    case unauthorized
    /// HTTP 402 from the credit-gated `/ugc/generate` route. Carries the
    /// server's balance/required figures when present so the UI can route
    /// to the paywall. (Production currently runs with credits disabled,
    /// so this is dormant until server-side credits are switched on — the
    /// client enforces credits locally in the meantime.)
    case insufficientCredits(balance: Int?, required: Int?)
    case custom(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .noData: return "No data received"
        case .decodingError: return "Failed to decode response"
        case .serverError: return "Server error"
        case .unauthorized: return "Unauthorized"
        case .insufficientCredits(_, let required):
            if let required { return "You need \(required) credits to generate this video." }
            return "You don't have enough credits."
        case .custom(let message): return message
        }
    }
}

/// Shape of the JSON error envelope the backend returns on failures, e.g.
/// `{ "success": false, "error": "insufficient_credits",
///    "data": { "balance": 0, "required": 100 } }`.
private struct APIErrorEnvelope: Decodable {
    let error: String?
    let message: String?
    struct Data: Decodable {
        let balance: Int?
        let required: Int?
    }
    let data: Data?
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

    /// Maps a non-2xx response to a typed `APIError`, decoding the backend
    /// JSON error envelope so callers get the server's message (and, for
    /// 402, the balance/required figures) instead of a generic "Server
    /// error".
    private func mapFailure(status: Int, data: Data) -> APIError {
        if status == 401 { return .unauthorized }
        let env = try? JSONDecoder().decode(APIErrorEnvelope.self, from: data)
        if status == 402 {
            return .insufficientCredits(balance: env?.data?.balance, required: env?.data?.required)
        }
        if let msg = env?.error ?? env?.message, !msg.isEmpty, msg != "insufficient_credits" {
            return .custom(msg)
        }
        return .serverError
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

        guard (200...299).contains(httpResponse.statusCode) else {
            throw mapFailure(status: httpResponse.statusCode, data: data)
        }

        return try decoder.decode(T.self, from: data)
    }

    func post<T: Codable>(path: String, body: [String: Any]) async throws -> T {
        let request = try makeRequest(path: path, method: "POST", body: body)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw mapFailure(status: httpResponse.statusCode, data: data)
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
            throw mapFailure(status: httpResponse.statusCode, data: data)
        }

        return try decoder.decode(T.self, from: data)
    }

    func delete(path: String) async throws {
        let request = try makeRequest(path: path, method: "DELETE")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw mapFailure(status: httpResponse.statusCode, data: data)
        }
    }
}
