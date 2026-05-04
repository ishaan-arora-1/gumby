import SwiftUI

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
            Image("LoginBackground")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: 56)

                HStack(spacing: 10) {
                    AuthBrandLogoPlaceholder(size: 36)
                    Text("Gumby")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)
                }

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

    @State private var email: String = ""
    @State private var didSendEmailLink = false

    private let horizontalInset: CGFloat = 24
    private let controlCornerRadius: CGFloat = 8
    /// Reference: slim social rows ~44–48pt; Continue slightly taller.
    private let socialHeight: CGFloat = 46
    private let continueHeight: CGFloat = 52

    var body: some View {
        ZStack {
            AppConstants.authScreenBackground.ignoresSafeArea()

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

                    AuthBrandLogoPlaceholder(size: 40)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)

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
                            provider: .github,
                            title: "Continue with GitHub",
                            icon: { AuthSocialGlyph.github }
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
            Text("Email")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)

            TextField(
                "",
                text: $email,
                prompt: Text("Email").foregroundColor(AppConstants.authLoginSecondaryText)
            )
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
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

            Button(action: submitEmail) {
                Text("Continue")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(AppConstants.authPrimaryCTALabel)
                    .frame(maxWidth: .infinity)
                    .frame(height: continueHeight)
                    .background(AppConstants.authPrimaryCTAFill)
                    .clipShape(RoundedRectangle(cornerRadius: controlCornerRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 20)
            .disabled(emailTrimmed.isEmpty || authService.isLoading)
            .opacity(emailTrimmed.isEmpty ? 0.45 : 1)
        }
    }

    private var emailTrimmed: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submitEmail() {
        didSendEmailLink = false
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
                // Wire Google Sign-In SDK, then `await authService.handleGoogleSignIn(idToken:)`.
                break
            case .github:
                // Wire GitHub OAuth, then `await authService.handleGitHubSignIn(idToken:)`.
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
