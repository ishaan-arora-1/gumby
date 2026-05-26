import SwiftUI

enum AppConstants {
    static let backgroundColor = Color(hex: "0D0D0D")
    static let surfaceColor = Color(hex: "1A1A1A")
    static let textPrimary = Color.white
    static let textSecondary = Color(hex: "8A8A8A")

    /// True black canvas for active conversation (matches reference chat UI).
    static let chatCanvasBlack = Color(hex: "000000")
    /// Landing / composer surfaces
    static let chatComposerSurface = Color(hex: "262626")
    static let chatComposerInner = Color(hex: "1C1C1C")
    /// iOS secondary label tone from reference mocks
    static let chatMutedLabel = Color(hex: "8E8E93")
    static let chatPlaceholder = Color(hex: "A3A3A3")
    /// Send circle + icon rail
    static let chatSendCircle = Color(hex: "525252")
    /// User bubble fill
    static let chatUserBubble = Color(hex: "262626")
    /// Modal / highlighted rows inside questions cards
    static let chatElevatedSurface = Color(hex: "2C2C2C")

    static let gradientColors: [Color] = [
        Color(hex: "FF6B35"),
        Color(hex: "FF3CAC"),
        Color(hex: "784BA0")
    ]

    static let accentGradient = LinearGradient(
        colors: gradientColors,
        startPoint: .leading,
        endPoint: .trailing
    )

    static let cardCornerRadius: CGFloat = 16
    static let buttonCornerRadius: CGFloat = 12

    // Login / auth flow (match onboarding mockups)
    static let authScreenBackground = Color(hex: "121212")
    /// Login social rows: flush with screen per reference; separation from border.
    static let authSocialButtonFill = Color(hex: "121212")
    static let authAccentBlue = Color(hex: "2563EB")
    static let authLandingLogInButtonFill = Color(hex: "1A1A1A")
    static let authLandingSecondaryText = Color(hex: "A1A1AA")
    static let authLoginSecondaryText = Color(hex: "8E8E93")
    static let authPrimaryCTAFill = Color(hex: "E5E5E5")
    static let authPrimaryCTALabel = Color(hex: "121212")
    static let authSocialButtonStroke = Color(hex: "2D2D2D")

    /// Update to your production legal URLs.
    static let termsOfServiceURL = URL(string: "https://gumby.ai/terms")!
    static let privacyPolicyURL = URL(string: "https://gumby.ai/privacy")!
    static let sidebarWidthRatio: CGFloat = 0.8
    static let pageSize = 20

    static let baseURL = "http://192.168.1.35:3000/api"

    /// iOS OAuth client ID for Google Sign-In. Must match the
    /// `GIDClientID` entry in Info.plist and the reversed URL scheme.
    /// Also add this client ID to Supabase Auth → Providers → Google → Authorized Client IDs.
    static let googleClientID = "429862551098-61qli52e04646cao0a38e4qdumf8ua64.apps.googleusercontent.com"

    static let supabaseURL = "https://zsmwvjrvuucuablyibko.supabase.co"
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbXd2anJ2dXVjdWFibHlpYmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MDAzNjQsImV4cCI6MjA5MzM3NjM2NH0.5F6QCXWf6bP7zfB9DpHYq0y6RfKiEzEhiEF6YTBDUXc"
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
