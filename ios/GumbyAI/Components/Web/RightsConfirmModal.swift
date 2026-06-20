import SwiftUI

/// Rights-confirmation gate shown before a generation that uses the user's
/// own uploaded reference photos — 1:1 port of
/// `web/components/studio/RightsConfirmModal.tsx`.
///
/// The user must affirm they own / have the rights to every image and that
/// the content is allowed. Uploaded images are also moderated server-side
/// at upload time (nudity / explicit content is rejected before it reaches
/// storage); this modal is the human-consent half of that gate.
///
/// Present it as a `.fullScreenCover` or overlay; it dims the background
/// and centers the consent card.
struct RightsConfirmModal: View {
    let imageCount: Int
    let onConfirm: () -> Void
    let onClose: () -> Void

    @State private var checked = false

    var body: some View {
        ZStack {
            // Dim backdrop — tap outside to dismiss, matching web.
            Color.black.opacity(0.7)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            card
                .padding(.horizontal, 24)
        }
        .preferredColorScheme(.dark)
        // Reset the checkbox each time the modal opens so consent is always
        // a deliberate action, never a stale carry-over.
        .onAppear { checked = false }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                ZStack {
                    Circle()
                        .fill(WebTheme.Color.accent2.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(WebTheme.Color.accent2)
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white.opacity(0.55))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 16)

            Text("Confirm your image rights")
                .font(WebTheme.Font.display(22, weight: .bold))
                .foregroundColor(.white)
                .padding(.bottom, 8)

            (
                Text("You're using ")
                    .foregroundColor(.white.opacity(0.65))
                + Text("\(imageCount) uploaded \(imageCount == 1 ? "image" : "images")")
                    .foregroundColor(.white).bold()
                + Text(" to generate this video. Before we continue, please confirm you have the right to use \(imageCount == 1 ? "it" : "them").")
                    .foregroundColor(.white.opacity(0.65))
            )
            .font(WebTheme.Font.body(14))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 20)

            // Consent checkbox row
            Button {
                checked.toggle()
            } label: {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .stroke(checked ? WebTheme.Color.accent2 : Color.white.opacity(0.3), lineWidth: 1.5)
                            .background(
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(checked ? WebTheme.Color.accent2 : Color.clear)
                            )
                            .frame(width: 18, height: 18)
                        if checked {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .heavy))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(.top, 1)

                    Text("I confirm that I own or have the rights to use all the images I uploaded, that they don't contain nudity, explicit, or unlawful content, and that I'm allowed to feature any person shown in them.")
                        .font(WebTheme.Font.body(13))
                        .foregroundColor(.white.opacity(0.75))
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .fill(Color.white.opacity(0.05))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .stroke(WebTheme.Color.border, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .padding(.bottom, 20)

            HStack(spacing: 8) {
                Button(action: { if checked { onConfirm() } }) {
                    Text("Confirm & generate")
                        .font(WebTheme.Font.body(14, weight: .semibold))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Capsule().fill(checked ? Color.white : Color.white.opacity(0.4)))
                }
                .buttonStyle(.plain)
                .disabled(!checked)

                Button(action: onClose) {
                    Text("Cancel")
                        .font(WebTheme.Font.body(14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .overlay(Capsule().stroke(WebTheme.Color.borderStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                .fill(WebTheme.Color.bg)
        )
        .overlay(
            RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                .stroke(WebTheme.Color.borderStrong, lineWidth: 1)
        )
        .frame(maxWidth: 420)
    }
}
