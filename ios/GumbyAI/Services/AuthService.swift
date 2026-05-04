import Foundation
import AuthenticationServices
import SwiftUI
import UIKit

@MainActor
class AuthService: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User? {
        didSet {
            if let id = currentUser?.id {
                KeychainHelper.shared.save(key: "auth_user_id", value: id)
            } else {
                KeychainHelper.shared.delete(key: "auth_user_id")
            }
        }
    }
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var _token: String?
    private var appleSignInCoordinator: AppleSignInCoordinator?

    private static let lastUsedAuthProviderKey = "auth_last_used_provider"

    static let shared = AuthService()

    var token: String? { _token }

    nonisolated func getToken() -> String? {
        KeychainHelper.shared.read(key: "auth_token")
    }

    nonisolated func getUserId() -> String? {
        KeychainHelper.shared.read(key: "auth_user_id")
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

    func lastUsedAuthProvider() -> String? {
        UserDefaults.standard.string(forKey: Self.lastUsedAuthProviderKey)
    }

    private func recordLastUsedProvider(_ provider: String) {
        UserDefaults.standard.set(provider, forKey: Self.lastUsedAuthProviderKey)
    }

    func startSignInWithApple() {
        errorMessage = nil
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let coordinator = AppleSignInCoordinator()
        appleSignInCoordinator = coordinator
        coordinator.onCompletion = { [weak self] result in
            Task { @MainActor in
                await self?.handleAppleSignIn(result: result)
                self?.appleSignInCoordinator = nil
            }
        }

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
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
                provider: AuthProvider.apple.rawValue,
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
        await signInWithSupabase(provider: AuthProvider.google.rawValue, idToken: idToken, fullName: nil)
        isLoading = false
    }

    func handleGitHubSignIn(idToken: String) async {
        isLoading = true
        errorMessage = nil
        await signInWithSupabase(provider: AuthProvider.github.rawValue, idToken: idToken, fullName: nil)
        isLoading = false
    }

    /// Sends a Supabase magic link / OTP email. Configure redirect URLs in Supabase for production.
    func sendEmailSignInLink(email: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("@") else {
            errorMessage = "Enter a valid email address"
            return
        }

        guard let url = URL(string: "\(AppConstants.supabaseURL)/auth/v1/otp") else {
            errorMessage = "Invalid Supabase URL"
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConstants.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(AppConstants.supabaseAnonKey)", forHTTPHeaderField: "Authorization")

        do {
            let body: [String: Any] = [
                "email": trimmed,
                "create_user": true,
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                errorMessage = "Email sign-in failed"
                return
            }

            if (200...299).contains(httpResponse.statusCode) {
                return
            }

            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                errorMessage = (obj["error_description"] as? String)
                    ?? (obj["message"] as? String)
                    ?? (obj["msg"] as? String)
                    ?? "Email sign-in failed"
            } else {
                errorMessage = "Email sign-in failed"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
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

            // Treat a valid Supabase token as a successful sign-in. The
            // local backend `/auth/verify` is best-effort — a backend that
            // is down or returns an unexpected shape must NOT bounce the
            // user back to the auth screen.
            self.currentUser = userFromSupabaseResponse(json, fullName: fullName)
            self.isAuthenticated = true
            self.errorMessage = nil
            recordLastUsedProvider(provider)

            await syncWithBackend(accessToken, fullName: fullName)

        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func userFromSupabaseResponse(
        _ json: [String: Any],
        fullName: PersonNameComponents?
    ) -> User {
        let userObj = json["user"] as? [String: Any]
        let id = (userObj?["id"] as? String) ?? UUID().uuidString
        let email = userObj?["email"] as? String

        let metadata = userObj?["user_metadata"] as? [String: Any]
        let appleName: String? = {
            guard let fullName else { return nil }
            let parts = [fullName.givenName, fullName.familyName].compactMap { $0 }
            let joined = parts.joined(separator: " ")
            return joined.isEmpty ? nil : joined
        }()
        let name = appleName
            ?? (metadata?["full_name"] as? String)
            ?? (metadata?["name"] as? String)
            ?? email?.split(separator: "@").first.map(String.init)
            ?? "There"
        let avatarURL = metadata?["avatar_url"] as? String

        return User(id: id, email: email, name: name, avatarURL: avatarURL, createdAt: nil)
    }

    /// Best-effort: refreshes `currentUser` from the backend after a fresh
    /// sign-in. Failure here does NOT sign the user out; we already have a
    /// valid Supabase session.
    private func syncWithBackend(
        _ token: String,
        fullName: PersonNameComponents?
    ) async {
        do {
            let user = try await fetchVerifiedUser(token: token, fullName: fullName)
            self.currentUser = user
        } catch {
            // Swallow: keep the Supabase-derived user. The chat layer will
            // surface its own backend errors if relevant.
        }
    }

    private func verifyAndSyncUser(
        _ token: String,
        fullName: PersonNameComponents? = nil,
        lastUsedProvider: String? = nil
    ) async {
        func fail(_ message: String) {
            errorMessage = message
            signOut()
        }

        do {
            let user = try await fetchVerifiedUser(token: token, fullName: fullName)
            self.currentUser = user
            self.isAuthenticated = true
            errorMessage = nil
            if let lastUsedProvider {
                recordLastUsedProvider(lastUsedProvider)
            }
        } catch let VerifyError.message(message) {
            fail(message)
        } catch {
            fail(
                "Could not reach the auth API at \(AppConstants.baseURL). Start the backend (e.g. on port 3000) or update AppConstants.baseURL. \(error.localizedDescription)"
            )
        }
    }

    private enum VerifyError: Error {
        case message(String)
    }

    private func fetchVerifiedUser(
        token: String,
        fullName: PersonNameComponents?
    ) async throws -> User {
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
        guard let httpResponse = response as? HTTPURLResponse else {
            throw VerifyError.message("Invalid response from auth server.")
        }

        if httpResponse.statusCode != 200 {
            let errObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            let serverError = errObj?["error"] as? String
            if httpResponse.statusCode == 401 {
                throw VerifyError.message(
                    serverError ?? "Session could not be verified with the API at \(AppConstants.baseURL)."
                )
            }
            throw VerifyError.message(
                serverError
                    ?? "Auth API returned HTTP \(httpResponse.statusCode). Is the backend running? \(AppConstants.baseURL)"
            )
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let apiResponse: APIResponse<User>
        do {
            apiResponse = try decoder.decode(APIResponse<User>.self, from: data)
        } catch {
            throw VerifyError.message(
                "Could not read user profile from the server. \(error.localizedDescription)"
            )
        }

        guard apiResponse.success, let user = apiResponse.data else {
            throw VerifyError.message(apiResponse.error ?? "Sign-in verification returned no user data.")
        }
        return user
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

enum AuthProvider: String {
    case apple
    case google
    case github
}

private final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var onCompletion: ((Result<ASAuthorization, Error>) -> Void)?

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return windows.first { $0.isKeyWindow }
            ?? windows.first
            ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        onCompletion?(.success(authorization))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onCompletion?(.failure(error))
    }
}
