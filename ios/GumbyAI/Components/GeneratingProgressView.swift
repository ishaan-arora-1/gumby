import SwiftUI

/// The "Producing your ad" progress screen.
///
/// Shared between the Studio funnel (`WebGeneratingAdView`) and the
/// History/Recents detail sheet, so an in-flight job shows the SAME beautiful
/// loading screen wherever it's opened — not the bare "Still rendering…"
/// spinner. Driven by plain `status` / `progress` inputs (rather than reading
/// `chatVM` directly) so any job can power it; the animation reads the latest
/// inputs each tick via `.onReceive`, so it tracks live polling updates.
struct GeneratingProgressView: View {
    let status: UGCJobStatus?
    let progress: Int

    @State private var tipIndex = 0
    @State private var displayProgress: Double = 0
    @State private var startDate = Date()
    @State private var lastTipDate = Date()

    private let timer = Timer.publish(every: 0.033, on: .main, in: .common).autoconnect()

    private let tips = [
        "Casting your creator…",
        "Lighting the scene…",
        "Dialling in their expression…",
        "Coloring the frame…",
        "Polishing the cut…",
        "Almost there…",
    ]

    private var label: String {
        switch status {
        case .renderingScene: return "Composing the scene"
        case .generatingVideo: return "Animating"
        case .finalizing: return "Polishing"
        default: return "Starting"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                Text("Producing your ad")
                    .font(WebTheme.Font.display(26, weight: .bold))
                    .foregroundColor(.white)
                Text("Composing the scene → Animating → Polishing")
                    .font(WebTheme.Font.body(13))
                    .foregroundColor(.white.opacity(0.55))
            }
            .multilineTextAlignment(.center)
            .padding(.top, 24)
            .padding(.bottom, 28)

            card
                .frame(maxWidth: 280)

            Text("Your video will take about two minutes. You can leave this page — it won’t stop generating, and your video will be saved to your history.")
                .font(WebTheme.Font.body(13))
                .foregroundColor(.white.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .padding(.top, 24)
        }
        .padding(.horizontal, 14)
        .onReceive(timer) { now in tick(now) }
    }

    private var card: some View {
        ZStack {
            RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                .fill(WebTheme.Color.studio)
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                        .stroke(WebTheme.Color.border, lineWidth: 1)
                )

            VStack(spacing: 14) {
                Circle()
                    .fill(WebTheme.Color.brandGradient)
                    .frame(width: 48, height: 48)
                    .overlay(Circle().fill(Color.white).frame(width: 16, height: 16))

                Text(label)
                    .font(WebTheme.Font.body(18, weight: .bold))
                    .foregroundColor(.white)

                Text(tips[tipIndex])
                    .font(WebTheme.Font.body(13))
                    .foregroundColor(.white.opacity(0.55))
                    .id(tipIndex)
                    .transition(.opacity)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.1)).frame(height: 6)
                        Capsule()
                            .fill(WebTheme.Color.brandGradient)
                            .frame(width: max(6, geo.size.width * displayProgress), height: 6)
                    }
                }
                .frame(height: 6)
                .padding(.horizontal, 24)

                Text("\(Int((displayProgress * 100).rounded()))%")
                    .font(WebTheme.Font.body(12))
                    .foregroundColor(.white.opacity(0.4))
            }
            .padding(24)
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
    }

    /// Eases `displayProgress` toward a blend of an elapsed-time curve and the
    /// server-reported percentage, and rotates the tip text. Reads `status` /
    /// `progress` fresh each tick (the closure is rebuilt on every render).
    private func tick(_ now: Date) {
        if status == .completed { displayProgress = 1; return }
        if status == .failed { return }
        let tau = 60.0
        let elapsed = now.timeIntervalSince(startDate)
        let timeBased = min(0.95, 1 - exp(-elapsed / tau))
        let serverPct = Double(progress) / 100.0
        let target = min(0.95, max(timeBased, serverPct * 0.95))
        displayProgress += (target - displayProgress) * 0.12
        if now.timeIntervalSince(lastTipDate) > 3.5 {
            withAnimation(.easeInOut(duration: 0.4)) { tipIndex = (tipIndex + 1) % tips.count }
            lastTipDate = now
        }
    }
}
