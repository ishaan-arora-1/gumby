import SwiftUI
import PhotosUI

/// SwiftUI port of `web/components/studio/PromptComposer.tsx`.
///
/// Visual structure top-to-bottom:
///   • Radial blue glow positioned ABOVE the card (Gemini-style)
///   • Outer `bg-composer` shell with `border-white/[0.08]` and a 2xl shadow
///   • Inner `bg-composerInner` panel padded 16
///       - Optional row of attachment thumbs (uploading spinner + remove X)
///       - Multi-line textarea ("Describe the video you want — …")
///       - Footer row with paperclip + aspect pill + duration pill + send
///
/// All state lives on the shared ChatViewModel so this can drop in without
/// changing any flow logic.
struct WebPromptComposer: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var photoPickerItems: [PhotosPickerItem] = []
    @FocusState private var focused: Bool

    // Web caps to 2 attachments; mirror that here.
    private let MAX_ATTACHMENTS = 2

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                glow
                    .allowsHitTesting(false)

                // Outer shell. Web uses `p-2` (8pt) around the inner panel
                // so the lighter `bg-composer` (#262626) frames the darker
                // inner (#1C1C1C) — that visible ring of lighter color
                // *is* the "border" the design reads as.
                VStack(spacing: 0) {
                    innerPanel
                        .padding(8)
                }
                .background(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                        .fill(WebTheme.Color.composer)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                        .strokeBorder(WebTheme.Color.border, lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.40), radius: 22, x: 0, y: 0)
            }

            if let err = chatVM.composerError, !err.isEmpty {
                Text(err)
                    .font(WebTheme.Font.body(11, weight: .medium))
                    .foregroundColor(Color(hex: "FF453A"))
            }
        }
    }

    // MARK: - Inner panel

    private var innerPanel: some View {
        VStack(spacing: 0) {
            if !chatVM.composerAttachments.isEmpty {
                attachmentsRow
                    .padding(.bottom, 6)
            }

            textArea

            footerRow
                .padding(.top, 6)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.white.opacity(0.05))
                        .frame(height: 1)
                }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(WebTheme.Color.composerInner)
        )
    }

    // MARK: - Attachments row

    private var attachmentsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chatVM.composerAttachments) { att in
                    ZStack(alignment: .topTrailing) {
                        Image(uiImage: att.image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 48, height: 48)
                            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                                    .stroke(WebTheme.Color.border, lineWidth: 1)
                            )
                            .overlay {
                                if att.uploading {
                                    ZStack {
                                        Color.black.opacity(0.55)
                                            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
                                        ProgressView()
                                            .tint(.white)
                                            .scaleEffect(0.6)
                                    }
                                }
                            }

                        Button {
                            chatVM.removeComposerAttachment(id: att.id)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 8, weight: .heavy))
                                .foregroundColor(.white)
                                .frame(width: 16, height: 16)
                                .background(
                                    UnevenRoundedRectangle(
                                        cornerRadii: .init(topLeading: 0, bottomLeading: WebTheme.Radius.btn, bottomTrailing: 0, topTrailing: WebTheme.Radius.btn)
                                    )
                                    .fill(Color.black.opacity(0.7))
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Textarea

    private var textArea: some View {
        // Reserve a fixed 3 lines of vertical space at all times — never
        // less, never more. `reservesSpace: true` is the key bit: it
        // pads the empty state to the same height it has when filled, so
        // the composer doesn't shrink when blank and doesn't grow as the
        // user types. (Previously this was `1...4`, which made the bar
        // jitter from 1 to 4 lines as the user typed.)
        TextField(
            "",
            text: $chatVM.composerPrompt,
            prompt: Text("Describe the video you want…")
                .foregroundColor(WebTheme.Color.placeholder),
            axis: .vertical
        )
        .lineLimit(3, reservesSpace: true)
        .font(WebTheme.Font.body(14))
        .foregroundColor(.white)
        .tint(.white)
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .focused($focused)
    }

    // MARK: - Footer row
    //
    // Phone widths can't fit paperclip + aspect pill (3 options) + duration
    // pill (2 options) + send button comfortably on a single row. We split
    // into two rows on tight widths and keep send pinned bottom-right.

    private var footerRow: some View {
        HStack(spacing: 6) {
            PhotosPicker(
                selection: $photoPickerItems,
                maxSelectionCount: MAX_ATTACHMENTS - chatVM.composerAttachments.count,
                matching: .images
            ) {
                Image(systemName: "paperclip")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(WebTheme.Color.elevated))
                    .overlay(Circle().stroke(WebTheme.Color.border, lineWidth: 1))
            }
            .disabled(chatVM.composerAttachments.count >= MAX_ATTACHMENTS)
            .opacity(chatVM.composerAttachments.count >= MAX_ATTACHMENTS ? 0.4 : 1)
            .onChange(of: photoPickerItems) { _, items in
                Task { await handlePicked(items) }
            }

            WebSegmentedPill(
                options: ["9:16", "1:1", "16:9"],
                selection: $chatVM.composerAspectRatio,
                label: { $0 }
            )

            WebSegmentedPill(
                options: [5, 10],
                selection: $chatVM.composerDuration,
                label: { "\($0)s" }
            )

            Spacer(minLength: 0)

            sendButton
        }
    }

    private var sendButton: some View {
        Button {
            chatVM.submitDirectPrompt()
        } label: {
            Group {
                if chatVM.isParsingPrompt {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.6)
                } else {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 28, height: 28)
            .background(Circle().fill(Color.white.opacity(0.10)))
            .overlay(Circle().stroke(WebTheme.Color.borderStrong, lineWidth: 1))
        }
        .buttonStyle(WebPressStyle())
        .disabled(
            chatVM.isParsingPrompt ||
            chatVM.composerAttachments.contains(where: { $0.uploading }) ||
            chatVM.composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 10
        )
        .opacity(
            (chatVM.isParsingPrompt ||
             chatVM.composerAttachments.contains(where: { $0.uploading }) ||
             chatVM.composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 10)
            ? 0.4 : 1
        )
    }

    // MARK: - Glow background

    private var glow: some View {
        // Subtle blue glow biased above the composer. Sized for phone — the
        // desktop version is huge and looks oppressive on a 6.1" screen.
        Ellipse()
            .fill(
                RadialGradient(
                    gradient: Gradient(stops: [
                        .init(color: Color(red: 59/255, green: 130/255, blue: 246/255).opacity(0.45), location: 0.0),
                        .init(color: Color(red: 37/255, green: 99/255, blue: 235/255).opacity(0.22), location: 0.45),
                        .init(color: Color.clear,                                                       location: 1.0),
                    ]),
                    center: .center,
                    startRadius: 2,
                    endRadius: 220
                )
            )
            .frame(width: 320, height: 220)
            .blur(radius: 40)
    }

    // MARK: - PhotosPicker -> UIImage handoff

    private func handlePicked(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                await MainActor.run {
                    chatVM.addComposerAttachment(img)
                }
            }
        }
        await MainActor.run {
            photoPickerItems = []
        }
    }
}
