import Foundation
import AuthenticationServices
import SwiftUI

@MainActor
class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var _token: String?

    static let shared = AuthService()

    var token: String? { _token }

    nonisolated func getToken() -> String? {
        MainActor.assumeIsolated { _token }
    }

    nonisolated func getUserId() -> String? {
        MainActor.assumeIsolated { currentUser?.id }
    }

    private init() {
        loadStoredSession()
    }

    func loadStoredSession() {
        if let storedToken = KeychainHelper.shared.read(key: "auth_token") {
            self._token = storedToken
            self.isAuthenticated = true
            Task {
                await verifyToken(storedToken)
            }
        }
    }

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        isLoading = true
        errorMessage = nil

        switch result {
        case .success(let authorization):
            guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let identityTokenData = appleIDCredential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8) else {
                errorMessage = "Failed to get Apple ID credentials"
                isLoading = false
                return
            }

            await signInWithSupabase(
                provider: "apple",
                idToken: identityToken,
                fullName: appleIDCredential.fullName
            )

        case .failure(let error):
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    func handleGoogleSignIn(idToken: String) async {
        isLoading = true
        errorMessage = nil
        await signInWithSupabase(provider: "google", idToken: idToken, fullName: nil)
        isLoading = false
    }

    private func signInWithSupabase(
        provider: String,
        idToken: String,
        fullName: PersonNameComponents?
    ) async {
        do {
            let supabaseURL = AppConstants.supabaseURL
            let supabaseAnonKey = AppConstants.supabaseAnonKey

            guard let url = URL(string: "\(supabaseURL)/auth/v1/token?grant_type=id_token") else {
                errorMessage = "Invalid Supabase URL"
                return
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(supabaseAnonKey)", forHTTPHeaderField: "Authorization")

            let bundleId = Bundle.main.bundleIdentifier ?? "unknown"
            var body: [String: Any] = [
                "provider": provider,
                "id_token": idToken,
                "client_id": bundleId
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let jwtParts = idToken.split(separator: ".")
            if jwtParts.count >= 2 {
                var payload = String(jwtParts[1])
                while payload.count % 4 != 0 { payload += "=" }
                if let decoded = Data(base64Encoded: payload),
                   let claims = try? JSONSerialization.jsonObject(with: decoded) as? [String: Any] {
                    NSLog("[AUTH DEBUG] Apple ID token aud: %@", "\(claims["aud"] ?? "nil")")
                    NSLog("[AUTH DEBUG] Apple ID token iss: %@", "\(claims["iss"] ?? "nil")")
                    NSLog("[AUTH DEBUG] Apple ID token sub: %@", "\(claims["sub"] ?? "nil")")
                }
            }
            NSLog("[AUTH DEBUG] Bundle ID (client_id): %@", bundleId)
            NSLog("[AUTH DEBUG] Request URL: %@", "\(supabaseURL)/auth/v1/token?grant_type=id_token")

            let (data, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            guard (200...299).contains(statusCode) else {
                let errorBody = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                let rawResponse = String(data: data, encoding: .utf8) ?? "no body"
                NSLog("[AUTH DEBUG] Supabase error (%d): %@", statusCode, rawResponse)
                errorMessage = (errorBody?["error_description"] as? String)
                    ?? (errorBody?["msg"] as? String)
                    ?? "Authentication failed"
                return
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let accessToken = json["access_token"] as? String else {
                errorMessage = "Invalid auth response"
                return
            }

            self._token = accessToken
            KeychainHelper.shared.save(key: "auth_token", value: accessToken)

            if let refreshToken = json["refresh_token"] as? String {
                KeychainHelper.shared.save(key: "refresh_token", value: refreshToken)
            }

            await verifyAndSyncUser(accessToken, fullName: fullName)

        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyAndSyncUser(_ token: String, fullName: PersonNameComponents? = nil) async {
        do {
            let url = URL(string: "\(AppConstants.baseURL)/auth/verify")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            var body: [String: Any] = ["token": token]
            if let name = fullName {
                let displayName = [name.givenName, name.familyName]
                    .compactMap { $0 }
                    .joined(separator: " ")
                if !displayName.isEmpty {
                    body["name"] = displayName
                }
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                signOut()
                return
            }

            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let apiResponse = try decoder.decode(APIResponse<User>.self, from: data)
            if let user = apiResponse.data {
                self.currentUser = user
                self.isAuthenticated = true
            } else {
                signOut()
            }
        } catch {
            signOut()
        }
    }

    func verifyToken(_ token: String) async {
        await verifyAndSyncUser(token)
    }

    func signOut() {
        isAuthenticated = false
        currentUser = nil
        _token = nil
        KeychainHelper.shared.delete(key: "auth_token")
        KeychainHelper.shared.delete(key: "refresh_token")
    }
}
