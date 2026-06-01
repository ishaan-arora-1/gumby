import SwiftUI

/// Web design system, ported 1:1 to SwiftUI.
///
/// `web/tailwind.config.ts` is the source of truth for everything in here.
/// Every color, radius, weight, and spacing constant matches a Tailwind
/// utility the web app uses, so iOS views can be written to feel literally
/// identical to the website.
///
/// Naming follows Tailwind conventions (canvas, elevated, composer, etc.)
/// rather than iOS conventions on purpose — when reading a SwiftUI view
/// next to its web counterpart you can pattern-match line by line.
enum WebTheme {

    // MARK: - Colors (lifted verbatim from tailwind.config.ts)

    enum Color {
        // Surfaces
        static let canvas        = SwiftUI.Color(hex: "000000")  // bg-canvas — true black
        static let bg            = SwiftUI.Color(hex: "0D0D0D")  // bg-bg     — page wash
        static let surface       = SwiftUI.Color(hex: "1A1A1A")  // bg-surface
        static let elevated      = SwiftUI.Color(hex: "262626")  // bg-elevated
        static let elevated2     = SwiftUI.Color(hex: "2C2C2C")  // bg-elevated2
        static let composer      = SwiftUI.Color(hex: "262626")  // bg-composer (outer prompt shell)
        static let composerInner = SwiftUI.Color(hex: "1C1C1C")  // bg-composerInner
        static let studio        = SwiftUI.Color(hex: "161616")  // bg-studio (StudioCard inner)
        static let line          = SwiftUI.Color(hex: "2D2D2D")

        // Text
        static let textPrimary   = SwiftUI.Color.white
        static let muted         = SwiftUI.Color(hex: "8E8E93")
        static let placeholder   = SwiftUI.Color(hex: "A3A3A3")
        static let secondary     = SwiftUI.Color(hex: "8A8A8A")
        static let tertiary      = SwiftUI.Color(hex: "6B6B6B")

        // Accents
        static let accent1       = SwiftUI.Color(hex: "FF6B35")
        static let accent2       = SwiftUI.Color(hex: "FF3CAC")
        static let accent3       = SwiftUI.Color(hex: "784BA0")
        static let cta           = SwiftUI.Color(hex: "E5E5E5")
        static let ctaText       = SwiftUI.Color(hex: "121212")
        static let accentBlue    = SwiftUI.Color(hex: "2563EB")
        static let authBg        = SwiftUI.Color(hex: "121212")

        // Translucent hairline borders (web uses `border-white/[0.06]` etc.)
        static let border       = SwiftUI.Color.white.opacity(0.08)
        static let borderSubtle = SwiftUI.Color.white.opacity(0.06)
        static let borderStrong = SwiftUI.Color.white.opacity(0.15)

        /// `bg-brand-gradient` — the orange→pink→purple sweep used in
        /// the landing page hero and the CTA buttons.
        static let brandGradient = LinearGradient(
            gradient: Gradient(colors: [accent1, accent2, accent3]),
            startPoint: .leading, endPoint: .trailing
        )
    }

    // MARK: - Radii (matches Tailwind rounded-card / rounded-btn / rounded-pill)

    enum Radius {
        static let card: CGFloat = 20
        static let btn:  CGFloat = 12
        static let pill: CGFloat = 999
    }

    // MARK: - Typography

    /// Inter — body font, mirrors Tailwind's `font-sans` and `font-display`.
    /// Sizes here line up with the px-based Tailwind text sizes used
    /// across the web app (text-[11px], text-xs=12, text-sm=14, etc.).
    enum Font {
        // Body — the most common scale
        static func body(_ size: CGFloat = 14, weight: Weight = .regular) -> SwiftUI.Font {
            .custom(weight.postScriptName, size: size)
        }

        /// `font-display` — same Inter face, just used for headings.
        /// Web pairs this with tight tracking (letter-spacing -0.02 to -0.04em).
        static func display(_ size: CGFloat, weight: Weight = .bold) -> SwiftUI.Font {
            .custom(weight.postScriptName, size: size)
        }

        /// Instrument Serif Italic — the elegant welcome heading
        /// ("Describe your content…"). Web's `font-serif`.
        static func serifItalic(_ size: CGFloat) -> SwiftUI.Font {
            .custom("InstrumentSerif-Italic", size: size)
        }

        static func serif(_ size: CGFloat) -> SwiftUI.Font {
            .custom("InstrumentSerif-Regular", size: size)
        }

        enum Weight {
            case regular, medium, semibold, bold
            var postScriptName: String {
                switch self {
                case .regular:  return "Inter-Regular"
                case .medium:   return "Inter-Medium"
                case .semibold: return "Inter-SemiBold"
                case .bold:     return "Inter-Bold"
                }
            }
        }
    }
}

// MARK: - View helpers that show up in nearly every web component

extension View {
    /// Equivalent of Tailwind's `rounded-card border border-white/[0.06] bg-elevated/30`.
    /// Pass any fill — most cards on web use `bg-elevated/30` or `bg-studio`.
    func webCard(
        fill: Color = WebTheme.Color.elevated.opacity(0.3),
        radius: CGFloat = WebTheme.Radius.card,
        border: Color = WebTheme.Color.borderSubtle
    ) -> some View {
        self.background(
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(border, lineWidth: 1)
        )
    }

    /// `text-[11px] uppercase tracking-[0.2em] text-white/40` — the
    /// section-label kicker used above almost every card on web.
    func webSectionLabel() -> some View {
        self.font(WebTheme.Font.body(11, weight: .semibold))
            .tracking(2.2)
            .foregroundColor(.white.opacity(0.4))
            .textCase(.uppercase)
    }
}

// MARK: - Press-feedback style that matches web `active:scale-95`

struct WebPressStyle: ButtonStyle {
    var scale: CGFloat = 0.97
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
