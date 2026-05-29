import SwiftUI

/// Mini 9:16 preview tile for one caption preset. Renders the actual
/// bundled font (Roboto-Black.ttf, Anton-Regular.ttf) with the preset's
/// outline + shadow + position + pop animation, scaled down to ~88px
/// wide so a row of three fits comfortably inside the studio sub-card.
///
/// SwiftUI Text doesn't have a real outline stroke — we emulate it with
/// 8 directional shadows, same trick the web preview uses. Close enough
/// to libass output that the user sees the right vibe.
struct CaptionPreviewTile: View {
    let preset: CaptionPreset
    let selected: Bool
    let onTap: () -> Void
    var sampleText: String = "THIS HITS"

    private let frameW: CGFloat = 88
    private var frameH: CGFloat { frameW * (16.0 / 9.0) }
    private var scale: CGFloat { frameW / 1080.0 }
    private var fontPx: CGFloat { preset.fontSize * scale }
    private var outlinePx: CGFloat { preset.outlineWidthPx * scale }
    private var shadowOffset: CGFloat { preset.shadowDyPx * scale }
    private var yPx: CGFloat { frameH * preset.positionYRatio }

    @State private var popping: Bool = false

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .center, spacing: 6) {
                ZStack {
                    // faux UGC background — soft radial gradient
                    RadialGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color(red: 80/255, green: 90/255, blue: 110/255).opacity(0.55), location: 0.0),
                            .init(color: Color(red: 20/255, green: 22/255, blue: 30/255).opacity(0.85), location: 0.6),
                            .init(color: Color(red: 8/255, green: 9/255, blue: 12/255), location: 1.0),
                        ]),
                        center: UnitPoint(x: 0.5, y: 0.35),
                        startRadius: 0,
                        endRadius: frameW * 0.9
                    )

                    captionLayer
                        .position(x: frameW / 2, y: yPx)
                }
                .frame(width: frameW, height: frameH)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(selected ? Color(hex: "3B82F6") : Color.white.opacity(0.1),
                                lineWidth: selected ? 2 : 1)
                )

                Text(preset.label)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(selected ? .white : Color.white.opacity(0.7))
            }
        }
        .buttonStyle(.plain)
        .onAppear {
            // Loop the pop animation while the tile is on screen.
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: false)) {
                popping = true
            }
        }
    }

    private var captionLayer: some View {
        let scaleX: CGFloat = popping ? preset.popSettlePct / 100 : preset.popFromPct / 100
        return Text(sampleText)
            .font(.custom(preset.font, size: fontPx))
            .foregroundColor(preset.fillColor)
            // 8-direction outline emulation
            .shadow(color: preset.outlineColor, radius: 0, x:  outlinePx, y: 0)
            .shadow(color: preset.outlineColor, radius: 0, x: -outlinePx, y: 0)
            .shadow(color: preset.outlineColor, radius: 0, x: 0, y:  outlinePx)
            .shadow(color: preset.outlineColor, radius: 0, x: 0, y: -outlinePx)
            .shadow(color: preset.shadowAlpha > 0
                        ? preset.shadowColor.opacity(preset.shadowAlpha)
                        : Color.clear,
                    radius: 0, x: 0, y: shadowOffset)
            .scaleEffect(scaleX)
            .opacity(popping ? 1.0 : 0.0)
    }
}
