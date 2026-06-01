import SwiftUI
import AVKit

/// SwiftUI port of `web/components/studio/TemplateCard.tsx`.
///
/// 9:16 looping video card with a gradient overlay at the bottom carrying
/// the actor name and one-line setting. Tapping the card fires `onTap`
/// (web opens a preview modal; iOS jumps straight into the studio funnel
/// with the template picked).
struct WebTemplateCard: View {
    let template: UGCTemplate
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                videoOrPoster

                // Bottom gradient + label — same `bg-gradient-to-t from-black
                // via-black/60 to-transparent` overlay the web uses.
                LinearGradient(
                    gradient: Gradient(stops: [
                        .init(color: .black,                location: 0.0),
                        .init(color: Color.black.opacity(0.6), location: 0.4),
                        .init(color: .clear,                location: 1.0),
                    ]),
                    startPoint: .bottom, endPoint: .top
                )
                .frame(height: 70)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 2) {
                    Text(template.actorName.isEmpty ? template.name : template.actorName)
                        .font(WebTheme.Font.body(13, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    if !template.setting.isEmpty {
                        Text(template.setting)
                            .font(WebTheme.Font.body(10))
                            .foregroundColor(.white.opacity(0.65))
                            .lineLimit(1)
                    }
                }
                .padding(10)
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .background(WebTheme.Color.elevated)
            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                    .stroke(WebTheme.Color.border, lineWidth: 1)
            )
        }
        .buttonStyle(WebPressStyle())
    }

    @ViewBuilder
    private var videoOrPoster: some View {
        if !template.videoURL.isEmpty, let url = URL(string: template.videoURL) {
            LoopingVideoView(url: url)
                .aspectRatio(9.0/16.0, contentMode: .fill)
                .clipped()
        } else if !template.thumbnailURL.isEmpty,
                  let posterURL = URL(string: template.thumbnailURL) {
            AsyncImage(url: posterURL) { phase in
                switch phase {
                case .success(let img): img.resizable().scaledToFill()
                default: Color.black
                }
            }
        } else {
            LinearGradient(
                colors: [
                    Color(red: 0.10, green: 0.10, blue: 0.12),
                    Color(red: 0.04, green: 0.04, blue: 0.05),
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }
}
