import SwiftUI

enum AppConstants {
    static let backgroundColor = Color(hex: "0D0D0D")
    static let surfaceColor = Color(hex: "1A1A1A")
    static let textPrimary = Color.white
    static let textSecondary = Color(hex: "8A8A8A")

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
    static let sidebarWidthRatio: CGFloat = 0.8
    static let pageSize = 20

    static let baseURL = "http://localhost:3000/api"

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
