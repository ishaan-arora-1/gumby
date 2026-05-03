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

            let body: [String: Any] = [
                "provider": provider,
                "id_token": idToken,
                "client_id": Bundle.main.bundleIdentifier ?? "com.ishaan.gumby"
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                let errorBody = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
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
