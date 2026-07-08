import SwiftUI
import UIKit

private enum AuthScreen {
    case welcome
    case login
}

struct AuthView: View {
    @EnvironmentObject private var authService: AuthService
    @State private var screen: AuthScreen = .welcome

    var body: some View {
        Group {
            switch screen {
            case .welcome:
                AuthWelcomeView {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        screen = .login
                    }
                }
            case .login:
                AuthLoginView {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        screen = .welcome
                    }
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: authService.isLoading)
    }
}

// MARK: - Welcome (Image 1)

private struct AuthWelcomeView: View {
    var onLogIn: () -> Void

    private let horizontalInset: CGFloat = 24
    private let heroCornerRadius: CGFloat = 10

    var body: some View {
        ZStack {
            // Solid chat-canvas color (matches Studio/AI chat screen) so
            // the auth flow feels like part of the same app — no more
            // mismatched lifestyle photo background.
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: 56)

                Image("LogoCombined")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 34)
                    .accessibilityLabel("Blinkugc")

                Spacer()

                VStack(spacing: 10) {
                    Text("Social media marketing,\nsupercharged")
                        .font(.system(size: 25, weight: .semibold))
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                        .foregroundColor(.white)

                    Text("Plan, create, and publish with AI.")
                        .font(.system(size: 16, weight: .regular))
                        .multilineTextAlignment(.center)
                        .foregroundColor(AppConstants.authLandingSecondaryText)
                }
                .padding(.horizontal, horizontalInset)

                Spacer()

                VStack(spacing: 18) {
                    Button(action: onLogIn) {
                        Text("Log in")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(AppConstants.authLandingLogInButtonFill)
                            .clipShape(RoundedRectangle(cornerRadius: heroCornerRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    welcomeLegalCopy
                }
                .padding(.horizontal, horizontalInset)
                .padding(.bottom, 28)
            }
        }
    }

    private var welcomeLegalCopy: some View {
        VStack(spacing: 6) {
            Text("By clicking continue, you agree to our")
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(AppConstants.authLandingSecondaryText)
                .multilineTextAlignment(.center)

            HStack(spacing: 6) {
                Link(destination: AppConstants.termsOfServiceURL) {
                    Text("Terms and Conditions")
                        .font(.system(size: 12, weight: .regular))
                        .underline()
                        .foregroundColor(.white)
                }

                Text("and")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(AppConstants.authLandingSecondaryText)

                Link(destination: AppConstants.privacyPolicyURL) {
                    Text("Privacy Policy")
                        .font(.system(size: 12, weight: .regular))
                        .underline()
                        .foregroundColor(.white)
                }
            }
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Login (Image 2)

private struct AuthLoginView: View {
    @EnvironmentObject private var authService: AuthService
    var onBack: () -> Void

    /// Email/password is the primary path (works for accounts made on the
    /// website too); the magic link stays as a passwordless fallback.
    enum EmailMode { case login, signUp }

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var name: String = ""
    @State private var mode: EmailMode = .login
    @State private var didSendEmailLink = false
    /// A non-error status line (e.g. "check your email to confirm").
    @State private var infoMessage: String?

    private let horizontalInset: CGFloat = 24
    private let controlCornerRadius: CGFloat = 8
    /// Reference: slim social rows ~44–48pt; Continue slightly taller.
    private let socialHeight: CGFloat = 46
    private let continueHeight: CGFloat = 52

    var body: some View {
        ZStack {
            // Use the same flat chat canvas as the rest of the app
            // instead of `authScreenBackground` (a slightly different
            // dark grey) so login looks like a continuation of the
            // chat experience.
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Button(action: onBack) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Spacer()
                    }
                    .padding(.leading, 4)
                    .padding(.top, 4)

                    Image("LogoMark")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 88)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                        .accessibilityLabel("Blinkugc")

                    Text("Log in")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 32)

                    VStack(spacing: 12) {
                        socialButton(
                            provider: .google,
                            title: "Continue with Google",
                            icon: { AuthSocialGlyph.google }
                        )
                        socialButton(
                            provider: .apple,
                            title: "Continue with Apple",
                            icon: { AuthSocialGlyph.apple }
                        )
                    }
                    .padding(.top, 40)

                    orDivider
                        .padding(.top, 24)
                        .padding(.bottom, 24)

                    emailSection

                    if didSendEmailLink {
                        Text("Check your email for a sign-in link.")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(AppConstants.authLoginSecondaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 10)
                    }

                    if let info = infoMessage {
                        Text(info)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(AppConstants.authLoginSecondaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 10)
                    }

                    if authService.isLoading {
                        ProgressView()
                            .tint(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 8)
                    }

                    if let error = authService.errorMessage {
                        Text(error)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(.red.opacity(0.9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, horizontalInset)
                .padding(.bottom, 36)
            }
        }
        .onChange(of: email) { _, _ in
            didSendEmailLink = false
            infoMessage = nil
        }
        .onChange(of: password) { _, _ in infoMessage = nil }
        // Don't carry a stale error in from a previous session/launch.
        // Without this, a user could open Login and see "invalid token"
        // or a leftover network error before they've tapped anything.
        .onAppear {
            authService.errorMessage = nil
        }
    }

    private var orDivider: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(AppConstants.authSocialButtonStroke.opacity(0.85))
                .frame(height: 1)
            Text("OR")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppConstants.authLoginSecondaryText)
            Rectangle()
                .fill(AppConstants.authSocialButtonStroke.opacity(0.85))
                .frame(height: 1)
        }
    }

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if mode == .signUp {
                fieldLabel("Name")
                styledField(
                    placeholder: "Name (optional)",
                    text: $name,
                    textContentType: .name,
                    keyboard: .default,
                    autocapitalize: .words
                )
            }

            fieldLabel("Email")
            styledField(
                placeholder: "Email",
                text: $email,
                textContentType: .emailAddress,
                keyboard: .emailAddress,
                autocapitalize: .never
            )
            .padding(.bottom, 4)

            fieldLabel("Password")
            styledSecureField(
                placeholder: mode == .signUp ? "Password (8+ chars)" : "Password",
                text: $password,
                isNew: mode == .signUp
            )

            Button(action: submitPassword) {
                Group {
                    if authService.isLoading {
                        ProgressView().tint(AppConstants.authPrimaryCTALabel)
                    } else {
                        Text(mode == .login ? "Log in" : "Create account")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(AppConstants.authPrimaryCTALabel)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: continueHeight)
                .background(AppConstants.authPrimaryCTAFill)
                .clipShape(RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
            .disabled(!canSubmitPassword || authService.isLoading)
            .opacity(canSubmitPassword ? 1 : 0.45)

            // Toggle between Log in / Sign up.
            HStack(spacing: 4) {
                Text(mode == .login ? "New here?" : "Already have an account?")
                    .foregroundColor(AppConstants.authLoginSecondaryText)
                Button(mode == .login ? "Create an account" : "Log in") {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        mode = (mode == .login ? .signUp : .login)
                    }
                    authService.errorMessage = nil
                    infoMessage = nil
                }
                .foregroundColor(.white)
                .fontWeight(.semibold)
            }
            .font(.system(size: 13))
            .frame(maxWidth: .infinity)
            .padding(.top, 16)

            // Passwordless fallback — the original magic-link flow.
            Button(action: submitMagicLink) {
                Text("Email me a sign-in link instead")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(AppConstants.authLoginSecondaryText)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            .disabled(emailTrimmed.isEmpty || authService.isLoading)
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.white)
    }

    private func styledField(
        placeholder: String,
        text: Binding<String>,
        textContentType: UITextContentType?,
        keyboard: UIKeyboardType,
        autocapitalize: TextInputAutocapitalization
    ) -> some View {
        TextField(
            "",
            text: text,
            prompt: Text(placeholder).foregroundColor(AppConstants.authLoginSecondaryText)
        )
        .textContentType(textContentType)
        .keyboardType(keyboard)
        .textInputAutocapitalization(autocapitalize)
        .autocorrectionDisabled()
        .font(.system(size: 16, weight: .regular))
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .frame(height: socialHeight)
        .background(AppConstants.authSocialButtonFill)
        .clipShape(RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous)
                .stroke(AppConstants.authSocialButtonStroke, lineWidth: 1)
        )
    }

    private func styledSecureField(
        placeholder: String,
        text: Binding<String>,
        isNew: Bool
    ) -> some View {
        SecureField(
            "",
            text: text,
            prompt: Text(placeholder).foregroundColor(AppConstants.authLoginSecondaryText)
        )
        .textContentType(isNew ? .newPassword : .password)
        .submitLabel(.go)
        .onSubmit { submitPassword() }
        .font(.system(size: 16, weight: .regular))
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .frame(height: socialHeight)
        .background(AppConstants.authSocialButtonFill)
        .clipShape(RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous)
                .stroke(AppConstants.authSocialButtonStroke, lineWidth: 1)
        )
    }

    private var emailTrimmed: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmitPassword: Bool {
        guard emailTrimmed.contains("@") else { return false }
        return mode == .login ? !password.isEmpty : password.count >= 8
    }

    private func submitPassword() {
        guard canSubmitPassword, !authService.isLoading else { return }
        didSendEmailLink = false
        infoMessage = nil
        authService.errorMessage = nil
        Task {
            switch mode {
            case .login:
                await authService.signInWithEmailPassword(email: emailTrimmed, password: password)
            case .signUp:
                let result = await authService.signUpWithEmailPassword(
                    email: emailTrimmed,
                    password: password,
                    name: name
                )
                if result == .needsEmailConfirmation {
                    infoMessage = "Check your email to confirm your account, then log in."
                    mode = .login
                }
                // .signedIn dismisses this screen automatically via the
                // AuthService `isAuthenticated` flag observed by ContentView.
            }
        }
    }

    private func submitMagicLink() {
        didSendEmailLink = false
        infoMessage = nil
        authService.errorMessage = nil
        Task {
            await authService.sendEmailSignInLink(email: emailTrimmed)
            if authService.errorMessage == nil {
                didSendEmailLink = true
            }
        }
    }

    private func socialButton(
        provider: AuthProvider,
        title: String,
        @ViewBuilder icon: @escaping () -> some View
    ) -> some View {
        let last = authService.lastUsedAuthProvider()
        let isLast = last == provider.rawValue

        return Button {
            didSendEmailLink = false
            switch provider {
            case .apple:
                authService.startSignInWithApple()
            case .google:
                authService.startSignInWithGoogle()
            case .github:
                // Wire GitHub OAuth, then `await authService.handleGitHubSignIn(idToken:)`.
                break
            case .email:
                // Email/password has its own dedicated form below — this
                // social-button path is never invoked for it.
                break
            }
        } label: {
            HStack(spacing: 10) {
                icon()
                    .frame(width: 20, height: 20)
                    .foregroundColor(.white)

                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .frame(height: socialHeight)
            .background(AppConstants.authSocialButtonFill)
            .clipShape(RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous)
                    .stroke(
                        isLast ? AppConstants.authAccentBlue : AppConstants.authSocialButtonStroke,
                        lineWidth: isLast ? 2 : 1
                    )
            )
            .overlay(alignment: .topTrailing) {
                if isLast {
                    Text("Last used")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(AppConstants.authAccentBlue)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(Color.white.opacity(0.28), lineWidth: 0.5)
                        )
                        .offset(x: 7, y: -7)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared chrome

private struct AuthBrandLogoPlaceholder: View {
    var size: CGFloat

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: size * 0.78))
            .foregroundStyle(
                LinearGradient(
                    colors: [
                        Color(hex: "FF6B35"),
                        Color(hex: "FF3CAC"),
                        Color(hex: "5B4FFF"),
                    ],
                    startPoint: .topTrailing,
                    endPoint: .bottomLeading
                )
            )
            .frame(width: size, height: size)
            .accessibilityLabel("Brand logo placeholder")
    }
}

private enum AuthSocialGlyph {
    @ViewBuilder
    static var google: some View {
        Text("G")
            .font(.system(size: 13, weight: .heavy, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Circle().fill(Color.white.opacity(0.1)))
    }

    @ViewBuilder
    static var github: some View {
        Image(systemName: "chevron.left.forwardslash.chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Circle().fill(Color.white.opacity(0.1)))
    }

    @ViewBuilder
    static var apple: some View {
        Image(systemName: "apple.logo")
            .font(.system(size: 16, weight: .medium))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview("Auth") {
    AuthView()
        .environmentObject(AuthService.shared)
}
