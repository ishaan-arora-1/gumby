import Foundation
import UIKit
import GoogleSignIn

/// Thin wrapper around the GoogleSignIn SDK that produces an ID token
/// for our Supabase `id_token` grant. All Supabase exchange happens in
/// `AuthService.handleGoogleSignIn(idToken:)`.
@MainActor
enum GoogleSignInService {
    /// Configures `GIDSignIn` from the `GIDClientID` Info.plist entry.
    /// Called once at app launch.
    static func configure() {
        if let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
    }

    /// Handle the OAuth redirect coming back into the app.
    @discardableResult
    static func handle(url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }

    /// Restores a cached Google session at launch, if any.
    static func restorePreviousSignIn() async -> String? {
        await withCheckedContinuation { continuation in
            GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
                continuation.resume(returning: user?.idToken?.tokenString)
            }
        }
    }

    /// Presents Google's sign-in UI and returns the resulting ID token.
    static func signIn() async throws -> String {
        let presenter = try topViewController()
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw GoogleSignInError.missingIDToken
        }
        return idToken
    }

    static func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    private static func topViewController() throws -> UIViewController {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        guard let root = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController else {
            throw GoogleSignInError.noPresenter
        }
        var top = root
        while let presented = top.presentedViewController {
            top = presented
        }
        return top
    }
}

enum GoogleSignInError: LocalizedError {
    case missingIDToken
    case noPresenter

    var errorDescription: String? {
        switch self {
        case .missingIDToken:
            return "Google returned no ID token."
        case .noPresenter:
            return "No view controller available to present Google sign-in."
        }
    }
}
