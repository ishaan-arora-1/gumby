import Foundation
import AuthenticationServices
import CryptoKit
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

    /// True while the very first session-restore check is still running.
    /// `ContentView` shows a neutral splash for this window instead of
    /// either the chat or the login screen — that's what prevents the
    /// "chat flashes for 2s, then bounces back to login" experience when
    /// a stored token has gone stale.
    @Published var isBootstrapping = true

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

    /// Restore a previously-signed-in session. Crucially:
    ///   - We do NOT flip `isAuthenticated` to true until the backend has
    ///     confirmed the stored token is still valid. Setting it eagerly
    ///     used to show the chat for ~2 seconds while verification ran,
    ///     and then bounce the user back to the login screen if the token
    ///     was stale — a confusing experience.
    ///   - If verification fails on cold start it is silent: we sign out
    ///     locally and surface NO error message, so the login screen
    ///     doesn't open with "invalid token" already visible before the
    ///     user has tapped anything.
    func loadStoredSession() {
        guard let storedToken = KeychainHelper.shared.read(key: "auth_token") else {
            // No stored token — go straight to the login screen.
            self.isBootstrapping = false
            return
        }
        self._token = storedToken
        Task { await silentlyVerifyOnLaunch(storedToken) }
    }

    private func silentlyVerifyOnLaunch(_ token: String) async {
        do {
            let user = try await fetchVerifiedUser(token: token, fullName: nil)
            self.currentUser = user
            self.isAuthenticated = true
            self.errorMessage = nil
        } catch {
            // Stale / revoked / network: drop the local session without
            // making any noise. The user will simply land on the login
            // screen with no error displayed.
            self._token = nil
            KeychainHelper.shared.delete(key: "auth_token")
            KeychainHelper.shared.delete(key: "refresh_token")
            self.isAuthenticated = false
            self.currentUser = nil
            self.errorMessage = nil
        }
        self.isBootstrapping = false
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

    // OAuth web flow plumbing. The session must be retained for the life of
    // the flow, and the presentation provider supplies the anchor window.
    private var webAuthSession: ASWebAuthenticationSession?
    private let webAuthContextProvider = WebAuthPresentationContextProvider()

    /// The custom URL scheme + redirect Supabase bounces back to. This must
    /// be added to Supabase → Auth → URL Configuration → Redirect URLs.
    private static let oauthCallbackScheme = "com.ishaan.gumby"
    private static let oauthRedirectURL = "com.ishaan.gumby://login-callback"

    /// Entry point for the "Continue with Google" button.
    ///
    /// We use the same mechanism as the website (`signInWithOAuth`): open
    /// Supabase's `/authorize?provider=google` endpoint in an
    /// `ASWebAuthenticationSession` and let Supabase run the Google OAuth +
    /// PKCE exchange server-side. This sidesteps the native GoogleSignIn
    /// id_token grant entirely — and with it the unsolvable nonce problem,
    /// where GoogleSignIn bakes a hidden nonce into the token that GoTrue's
    /// id_token grant then refuses to accept.
    func startSignInWithGoogle() {
        errorMessage = nil

        // PKCE: a high-entropy verifier kept on-device; only its SHA-256
        // challenge goes out in the authorize URL. Supabase returns a code
        // we exchange for a session using the verifier.
        let verifier = Self.randomCodeVerifier()
        let challenge = Self.codeChallenge(for: verifier)

        var components = URLComponents(string: "\(AppConstants.supabaseURL)/auth/v1/authorize")
        components?.queryItems = [
            URLQueryItem(name: "provider", value: AuthProvider.google.rawValue),
            URLQueryItem(name: "redirect_to", value: Self.oauthRedirectURL),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        guard let authURL = components?.url else {
            errorMessage = "Could not start Google sign-in."
            return
        }

        isLoading = true
        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: Self.oauthCallbackScheme
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                await self?.finishGoogleOAuth(callbackURL: callbackURL, error: error, verifier: verifier)
            }
        }
        session.presentationContextProvider = webAuthContextProvider
        // Reuse the system browser session so a user already signed into
        // Google doesn't have to re-enter credentials — mirrors the web.
        session.prefersEphemeralWebBrowserSession = false
        webAuthSession = session
        session.start()
    }

    /// Handles the ASWebAuthenticationSession callback: surfaces cancels /
    /// errors, then exchanges the returned `code` for a Supabase session.
    private func finishGoogleOAuth(callbackURL: URL?, error: Error?, verifier: String) async {
        defer {
            isLoading = false
            webAuthSession = nil
        }

        if let error {
            let ns = error as NSError
            // User dismissed the sheet — not an error worth surfacing.
            if ns.domain == ASWebAuthenticationSessionError.errorDomain,
               ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                return
            }
            errorMessage = error.localizedDescription
            return
        }

        guard let callbackURL,
              let comps = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
            errorMessage = "Google sign-in was cancelled."
            return
        }

        let items = comps.queryItems ?? []
        if let errDesc = items.first(where: { $0.name == "error_description" })?.value {
            errorMessage = errDesc.replacingOccurrences(of: "+", with: " ")
            return
        }
        guard let code = items.first(where: { $0.name == "code" })?.value else {
            errorMessage = "Could not complete Google sign-in."
            return
        }

        await exchangePKCECode(code, verifier: verifier)
    }

    /// Exchanges the PKCE `code` for a Supabase session
    /// (`/token?grant_type=pkce`) and stores the resulting tokens.
    private func exchangePKCECode(_ code: String, verifier: String) async {
        do {
            guard let url = URL(string: "\(AppConstants.supabaseURL)/auth/v1/token?grant_type=pkce") else {
                errorMessage = "Invalid Supabase URL"
                return
            }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(AppConstants.supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(AppConstants.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "auth_code": code,
                "code_verifier": verifier,
            ])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                let env = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                errorMessage = (env?["error_description"] as? String)
                    ?? (env?["msg"] as? String)
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

            self.currentUser = userFromSupabaseResponse(json, fullName: nil)
            self.isAuthenticated = true
            self.errorMessage = nil
            recordLastUsedProvider(AuthProvider.google.rawValue)

            await syncWithBackend(accessToken, fullName: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - PKCE helpers

    /// RFC 7636 code verifier — 64 unreserved chars from a CSPRNG.
    private static func randomCodeVerifier() -> String {
        let charset = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        // UInt8.random uses SystemRandomNumberGenerator, which is a CSPRNG.
        return String((0..<64).map { _ in charset[Int.random(in: 0..<charset.count)] })
    }

    /// base64url(SHA256(verifier)) with no padding — the S256 challenge.
    private static func codeChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
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
        fullName: PersonNameComponents?,
        accessToken: String? = nil
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

            var body: [String: Any] = [
                "provider": provider,
                "id_token": idToken,
            ]

            if provider == AuthProvider.google.rawValue {
                // Supabase's documented native-Google exchange: id_token +
                // access_token, no client_id. Sending client_id pushes GoTrue
                // onto its generic-OIDC path, which enforces a nonce match —
                // impossible here because GoogleSignIn auto-generates the
                // token's nonce internally and never exposes it. Omitting
                // client_id keeps GoTrue on the named-Google verifier, which
                // validates signature + audience instead. GoTrue checks the
                // token's `aud` against the client IDs configured for the
                // Google provider in the Supabase dashboard.
                if let accessToken, !accessToken.isEmpty {
                    body["access_token"] = accessToken
                }
            } else {
                // Apple / GitHub: their ID tokens carry no nonce claim, so the
                // client_id path is fine and unchanged.
                body["client_id"] = Bundle.main.bundleIdentifier ?? "com.ishaan.gumby"
            }

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
        GoogleSignInService.signOut()
    }

    /// Permanently delete the signed-in user's account and all their data.
    /// Required by App Store Review Guideline 5.1.1(v).
    func deleteAccount() async -> Bool {
        guard let token = _token ?? KeychainHelper.shared.read(key: "auth_token") else {
            errorMessage = "You must be signed in to delete your account."
            return false
        }

        let url = URL(string: "\(AppConstants.baseURL)/auth/account")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let errObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                errorMessage = (errObj?["error"] as? String) ?? "Could not delete account."
                return false
            }
            signOut()
            return true
        } catch {
            errorMessage = "Could not reach the server: \(error.localizedDescription)"
            return false
        }
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

/// Supplies the anchor window for `ASWebAuthenticationSession` (the Google
/// OAuth web flow).
private final class WebAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        return windows.first { $0.isKeyWindow }
            ?? windows.first
            ?? ASPresentationAnchor()
    }
}
