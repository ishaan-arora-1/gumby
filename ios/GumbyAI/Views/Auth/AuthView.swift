import SwiftUI
import AuthenticationServices

struct AuthView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 40) {
                Spacer()
                
                VStack(spacing: 16) {
                    Text("GUMBY")
                        .font(.system(size: 48, weight: .black))
                        .foregroundStyle(AppConstants.accentGradient)
                    
                    Text("AI")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(AppConstants.textPrimary)
                    
                    Text("Social Media Marketing, Supercharged")
                        .font(.subheadline)
                        .foregroundColor(AppConstants.textSecondary)
                }
                
                Spacer()
                
                VStack(spacing: 16) {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.fullName, .email]
                    } onCompletion: { result in
                        Task {
                            await authService.handleAppleSignIn(result: result)
                        }
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    
                    Button(action: {
                        // TODO: Integrate Google Sign-In SDK
                        // 1. Add GoogleSignIn-iOS SPM package
                        // 2. Call GIDSignIn.sharedInstance.signIn(...)
                        // 3. Get idToken from result.user.idToken?.tokenString
                        // 4. Call: await authService.handleGoogleSignIn(idToken: token)
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "g.circle.fill")
                                .font(.title2)
                            Text("Sign in with Google")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Color.white)
                        .foregroundColor(.black)
                        .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    }
                }
                .padding(.horizontal, 32)
                
                if authService.isLoading {
                    ProgressView()
                        .tint(.white)
                }
                
                if let error = authService.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal)
                }
                
                Spacer()
                    .frame(height: 60)
            }
        }
    }
}

#Preview {
    AuthView()
        .environmentObject(AuthService.shared)
}
