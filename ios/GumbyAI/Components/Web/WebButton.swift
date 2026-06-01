import SwiftUI

/// 1:1 SwiftUI port of `web/components/ui/Button.tsx`.
/// Same variant + size matrix, same shape, same hover/press behavior
/// (active:scale-95 → WebPressStyle).
struct WebButton<Label: View>: View {
    enum Variant {
        case primary, gradient, ghost, glass, outline, dark
    }
    enum Size {
        case sm, md, lg, xl
    }

    var variant: Variant = .primary
    var size: Size = .md
    var fullWidth: Bool = false
    var action: () -> Void
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) { label() }
                .frame(maxWidth: fullWidth ? .infinity : nil)
                .frame(height: heightFor(size))
                .padding(.horizontal, horizontalPaddingFor(size))
                .font(.custom("Inter-SemiBold", size: fontSizeFor(size)))
                .foregroundStyle(foregroundFor(variant))
                .background(backgroundFor(variant))
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.pill, style: .continuous)
                        .stroke(strokeFor(variant), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.pill, style: .continuous))
        }
        .buttonStyle(WebPressStyle())
    }

    // MARK: - Per-variant fills

    @ViewBuilder
    private func backgroundFor(_ v: Variant) -> some View {
        switch v {
        case .primary:
            WebTheme.Color.cta
        case .gradient:
            WebTheme.Color.brandGradient
        case .ghost:
            Color.clear
        case .glass:
            Color.white.opacity(0.06)
        case .outline:
            Color.clear
        case .dark:
            Color.black
        }
    }

    private func foregroundFor(_ v: Variant) -> Color {
        switch v {
        case .primary: return WebTheme.Color.ctaText
        case .gradient, .glass, .outline, .ghost, .dark: return .white
        }
    }

    private func strokeFor(_ v: Variant) -> Color {
        switch v {
        case .outline: return Color.white.opacity(0.15)
        case .dark:    return Color.white.opacity(0.12)
        default:       return Color.clear
        }
    }

    // MARK: - Size table — mirrors Tailwind h-8/h-10/h-12/h-14 + px values

    private func heightFor(_ s: Size) -> CGFloat {
        switch s {
        case .sm: return 32
        case .md: return 40
        case .lg: return 48
        case .xl: return 56
        }
    }
    private func horizontalPaddingFor(_ s: Size) -> CGFloat {
        switch s {
        case .sm: return 16
        case .md: return 20
        case .lg: return 28
        case .xl: return 32
        }
    }
    private func fontSizeFor(_ s: Size) -> CGFloat {
        switch s {
        case .sm: return 13
        case .md: return 14
        case .lg: return 15
        case .xl: return 16
        }
    }
}

// MARK: - Convenience: string-only label overload

extension WebButton where Label == Text {
    init(_ title: String,
         variant: Variant = .primary,
         size: Size = .md,
         fullWidth: Bool = false,
         action: @escaping () -> Void)
    {
        self.init(variant: variant, size: size, fullWidth: fullWidth, action: action) {
            Text(title)
        }
    }
}
