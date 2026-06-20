import SwiftUI
import PhotosUI

/// SwiftUI port of `web/components/studio/PromptComposer.tsx`.
///
/// Free-form upload zone: the user can attach up to five references for the
/// creator, product, background, vibe, or any combination, and explains what
/// each image is inside the prompt itself. Submitting hands the prompt +
/// attachment URLs straight to the studio form — no `/parse-prompt`
/// round-trip. Uploaded images that haven't been rights-confirmed trigger the
/// consent modal before advancing.
struct WebPromptComposer: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var showRights = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                glow
                    .allowsHitTesting(false)

                VStack(spacing: 0) {
                    innerPanel
                        .padding(8)
                }
                .background(
                    // The fill AND the drop-shadow live on THIS background shape,
                    // not on the VStack itself. A `.shadow()` applied to the
                    // container that holds the TextEditor forces SwiftUI to
                    // rasterize that subtree offscreen to compute the shadow,
                    // which makes typed text intermittently render with no color
                    // (invisible until the field is re-selected / re-drawn).
                    // Casting the shadow from the background shape keeps the text
                    // layer un-rasterized — and the background still hugs the
                    // content, so the surrounding glow halo stays visible.
                    // (This is why the earlier TextField→TextEditor swap didn't
                    // fix it — the shadow, not the control, was the trigger.)
                    RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                        .fill(WebTheme.Color.composer)
                        .shadow(color: .black.opacity(0.40), radius: 22, x: 0, y: 0)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                        .strokeBorder(WebTheme.Color.border, lineWidth: 1)
                )
            }

            if let err = chatVM.composerError, !err.isEmpty {
                Text(err)
                    .font(WebTheme.Font.body(11, weight: .medium))
                    .foregroundColor(Color(hex: "FF453A"))
            }
        }
        .fullScreenCover(isPresented: $showRights) {
            RightsConfirmModal(
                imageCount: chatVM.composerRemoteURLs.count,
                onConfirm: {
                    ImageRights.markConfirmed(chatVM.composerRemoteURLs)
                    showRights = false
                    chatVM.submitComposer()
                },
                onClose: { showRights = false }
            )
            .presentationBackground(.clear)
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
            HStack(spacing: 10) {
                ForEach(chatVM.composerAttachments) { att in
                    thumb(att)
                        .overlay(alignment: .topTrailing) {
                            removeBadge { chatVM.removeComposerAttachment(id: att.id) }
                        }
                }
            }
            // Headroom so the overhanging remove badges aren't clipped.
            .padding(.top, 6)
            .padding(.trailing, 6)
            .padding(.horizontal, 2)
        }
    }

    /// Clean floating circular remove button, matching the web composer.
    private func removeBadge(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(Color.black.opacity(0.65)))
                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .offset(x: 6, y: -6)
    }

    @ViewBuilder
    private func thumb(_ att: StudioAttachment) -> some View {
        Group {
            if let img = att.image {
                Image(uiImage: img).resizable().scaledToFill()
            } else if let url = URL(string: att.remoteUrl) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase { image.resizable().scaledToFill() }
                    else { WebTheme.Color.elevated }
                }
            } else {
                WebTheme.Color.elevated
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                .stroke(WebTheme.Color.border, lineWidth: 1)
        )
        .overlay {
            if att.uploading {
                ZStack {
                    Color.black.opacity(0.35)
                    ProgressView().tint(.white)
                }
                .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
            }
        }
    }

    // MARK: - Textarea

    private var textArea: some View {
        // A `TextEditor` (UITextView-backed), NOT `TextField(axis: .vertical)`.
        // The invisible-typed-text bug was actually caused by the composer
        // panel's drop-shadow being an *ancestor* of this input (see the
        // ZStack above, where the shadow now lives on a standalone background
        // layer instead). Either control works once the shadow is off the
        // ancestor chain; TextEditor is kept to match the app's other
        // multiline inputs.
        //
        // IMPORTANT: a TextEditor is greedy — it expands to fill whatever
        // vertical space the parent offers. Use a FIXED height (not minHeight)
        // so it stays ~3 lines tall and scrolls internally past that, instead
        // of ballooning to fill the screen.
        ZStack(alignment: .topLeading) {
            if chatVM.composerPrompt.isEmpty {
                Text("Describe your product ad. Drop in a product photo too.")
                    .font(WebTheme.Font.body(14))
                    .foregroundColor(WebTheme.Color.placeholder)
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $chatVM.composerPrompt)
                .scrollContentBackground(.hidden)
                .frame(height: 70)
                .font(WebTheme.Font.body(14))
                .foregroundStyle(.white)
                .tint(.white)
                .focused($focused)
        }
    }

    // MARK: - Footer row

    private var footerRow: some View {
        HStack(spacing: 6) {
            PhotosPicker(
                selection: $photoPickerItems,
                maxSelectionCount: max(0, ChatViewModel.MAX_ATTACHMENTS - chatVM.composerAttachments.count),
                matching: .images
            ) {
                Image(systemName: "paperclip")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(WebTheme.Color.elevated))
                    .overlay(Circle().stroke(WebTheme.Color.border, lineWidth: 1))
            }
            .disabled(chatVM.composerAttachments.count >= ChatViewModel.MAX_ATTACHMENTS)
            .opacity(chatVM.composerAttachments.count >= ChatViewModel.MAX_ATTACHMENTS ? 0.4 : 1)
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
        Button(action: attemptSubmit) {
            Image(systemName: "arrow.up")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.white.opacity(0.10)))
                .overlay(Circle().stroke(WebTheme.Color.borderStrong, lineWidth: 1))
        }
        .buttonStyle(WebPressStyle())
        .disabled(!chatVM.canSubmitComposer)
        .opacity(chatVM.canSubmitComposer ? 1 : 0.4)
    }

    private func attemptSubmit() {
        guard chatVM.canSubmitComposer else { return }
        let urls = chatVM.composerRemoteURLs
        if ImageRights.hasUnconfirmed(urls) {
            showRights = true
            return
        }
        chatVM.submitComposer()
    }

    // MARK: - Glow background

    private var glow: some View {
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

    // MARK: - PhotosPicker → UIImage handoff

    private func handlePicked(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                await MainActor.run { chatVM.addComposerAttachment(img) }
            }
        }
        await MainActor.run { photoPickerItems = [] }
    }
}
