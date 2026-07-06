import SwiftUI

/// SwiftUI port of `web/components/studio/BlueprintCard.tsx`.
///
/// 9:16 card for a one-tap viral template. Autoplays the rendered example
/// clip when the blueprint ships one; otherwise falls back to a designed
/// two-tone gradient cover built from the blueprint's accent colors.
struct WebBlueprintCard: View {
    let blueprint: Blueprint
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                cover

                // Bottom shade + name/tagline/credits — same overlay web uses.
                LinearGradient(
                    gradient: Gradient(stops: [
                        .init(color: .black,                    location: 0.0),
                        .init(color: Color.black.opacity(0.75), location: 0.35),
                        .init(color: .clear,                    location: 1.0),
                    ]),
                    startPoint: .bottom, endPoint: .top
                )
                .frame(height: 96)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .allowsHitTesting(false)

                // Name only — tagline/pricing live in the modal, keeping the
                // card clean in the mixed gallery (mirrors web).
                Text(blueprint.name)
                    .font(WebTheme.Font.body(13, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .padding(10)
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .background(WebTheme.Color.elevated)
            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                    .stroke(WebTheme.Color.border, lineWidth: 1)
            )
            .overlay(alignment: .topLeading) { formatBadge }
        }
        .buttonStyle(WebPressStyle())
    }

    @ViewBuilder
    private var cover: some View {
        if let s = blueprint.previewVideoURL, let url = URL(string: s) {
            LoopingVideoView(url: url)
                .aspectRatio(9.0/16.0, contentMode: .fill)
                .clipped()
        } else {
            // Gradient cover from the blueprint's accent pair (web renders
            // two radial gradients; two opposing linear stops read the same
            // at card size).
            let c1 = Color(hex: blueprint.accent.first?.replacingOccurrences(of: "#", with: "") ?? "444444")
            let c2 = Color(hex: blueprint.accent.last?.replacingOccurrences(of: "#", with: "") ?? "111111")
            ZStack {
                LinearGradient(
                    colors: [c1.opacity(0.55), Color(hex: "0B0B0E"), c2.opacity(0.6)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                Image(systemName: "film.stack")
                    .font(.system(size: 34, weight: .regular))
                    .foregroundColor(c1.opacity(0.4))
                    .offset(y: -24)
            }
        }
    }

    private var formatBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: blueprint.hasCreator ? "person.fill" : "cube.box.fill")
                .font(.system(size: 8, weight: .semibold))
            Text(blueprint.hasCreator ? "CREATOR" : "PRODUCT SHOT")
                .font(WebTheme.Font.body(8, weight: .semibold))
                .tracking(0.8)
        }
        .foregroundColor(.white.opacity(0.8))
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(Capsule().fill(Color.black.opacity(0.6)))
        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
        .padding(8)
    }
}
