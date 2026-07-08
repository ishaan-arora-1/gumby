import SwiftUI

/// Unified template preview (mirror of web's TemplatePreviewModal) — one
/// flow for every card, blueprint or featured creator. Plays the looping
/// example clip with a mute toggle (audio available on a user tap) and a
/// "Use as template" CTA that hands off to the input modal.
struct WebTemplatePreviewSheet: View {
    let target: TemplateTarget
    let onClose: () -> Void
    let onUse: () -> Void

    @State private var muted = true

    var body: some View {
        ZStack {
            Color.black.opacity(0.92)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(spacing: 16) {
                videoCard
                Text(target.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }
            .padding(.horizontal, 20)

            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.white.opacity(0.10)))
                            .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }

    private var videoCard: some View {
        ZStack {
            Group {
                if let s = target.videoURL, let url = URL(string: s) {
                    LoopingVideoView(url: url, isActive: true, muted: muted, aspectFill: true)
                } else if let s = target.posterURL, let url = URL(string: s) {
                    AsyncImage(url: url) { phase in
                        if case .success(let image) = phase { image.resizable().scaledToFill() }
                        else { previewFallback }
                    }
                } else {
                    previewFallback
                }
            }
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )

            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [.clear, Color.black.opacity(0.45), Color.black.opacity(0.85)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .allowsHitTesting(false)

            // Mute toggle — only when there's a video to hear.
            if target.videoURL != nil {
                VStack {
                    HStack {
                        Button { muted.toggle() } label: {
                            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(Color.black.opacity(0.45)))
                        }
                        Spacer()
                    }
                    .padding(10)
                    Spacer()
                }
            }

            VStack {
                Spacer()
                Button(action: onUse) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles").font(.system(size: 14, weight: .semibold))
                        Text("Use as template").font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .frame(height: 48)
                    .background(Capsule().fill(Color.white))
                }
                .buttonStyle(.plain)
                .padding(.bottom, 20)
            }
        }
        .frame(maxWidth: 420)
    }

    private var previewFallback: some View {
        ZStack {
            Color(hex: "1A1A1A")
            VStack(spacing: 10) {
                Image(systemName: target.kind == .creator ? "person.fill" : "cube.box.fill")
                    .font(.system(size: 30))
                    .foregroundColor(.white.opacity(0.3))
                Text("Preview coming soon")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
}
