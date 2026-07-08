import SwiftUI
import PhotosUI

/// The one input modal every template uses (mirror of web's TemplateModal).
///
/// Keeps the template's locked look and asks only for what makes the ad
/// yours: product photo (required, moderated upload) + name + one line, a
/// script you can auto-generate and edit (talking templates), a free-text
/// "tweaks" nudge, and a caption style. Blueprints post to the blueprint
/// endpoint; featured creators compile a prompt and run the unified
/// pipeline with the creator fixed.
struct WebTemplateModal: View {
    let target: TemplateTarget
    @EnvironmentObject var chatVM: ChatViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var pickerItem: PhotosPickerItem?
    @State private var productImage: UIImage?
    @State private var remoteUrl: String?
    @State private var uploading = false
    @State private var uploadError: String?
    @State private var productName = ""
    @State private var productDescription = ""
    @State private var script = ""
    @State private var generatingScript = false
    @State private var tweaks = ""
    @State private var captionsEnabled = true
    @State private var captionPresetId = CaptionPreset.defaultId

    @FocusState private var focusedField: Field?
    private enum Field { case name, desc, script, tweaks }

    private var talking: Bool { target.talking }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                photoDrop
                WebModalField(text: $productName, placeholder: "Product name (recommended)")
                    .focused($focusedField, equals: .name)
                WebModalField(text: $productDescription, placeholder: "One line about it (helps the script)")
                    .focused($focusedField, equals: .desc)

                if talking { scriptSection }
                tweaksSection
                if talking { captionSection }

                if let err = uploadError ?? chatVM.blueprintError {
                    Text(err)
                        .font(WebTheme.Font.body(13))
                        .foregroundColor(Color(hex: "FF453A"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                generateButton
                Text("\(target.durationSeconds)s vertical video · \(talking ? (captionsEnabled ? "captions included" : "no captions") : "silent product shot")")
                    .font(WebTheme.Font.body(11))
                    .foregroundColor(.white.opacity(0.35))
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 28)
        }
        .background(Color(hex: "101014").ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear {
            chatVM.blueprintError = nil
            if script.isEmpty { script = target.sampleScript }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: target.kind == .creator ? "person.fill" : "cube.box.fill")
                    .font(.system(size: 9, weight: .semibold))
                Text(target.kind == .creator ? "CREATOR" : "PRODUCT TEMPLATE")
                    .font(WebTheme.Font.body(10, weight: .semibold))
                    .tracking(1.0)
            }
            .foregroundColor(.white.opacity(0.6))
            Text(target.name)
                .font(WebTheme.Font.display(24, weight: .bold))
                .foregroundColor(.white)
                .tracking(-0.3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 20)
    }

    // MARK: Product photo

    private var photoDrop: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("YOUR PRODUCT PHOTO").webSectionLabel()
            PhotosPicker(selection: $pickerItem, matching: .images) {
                ZStack {
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .fill(Color.white.opacity(0.03))
                    if let img = productImage {
                        Image(uiImage: img).resizable().scaledToFit().padding(6)
                    } else {
                        VStack(spacing: 8) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
                            Text("Drop in your product photo")
                                .font(WebTheme.Font.body(14))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                    if uploading {
                        Color.black.opacity(0.55)
                            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
                        ProgressView().tint(.white)
                    }
                }
                .frame(height: 160)
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                )
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { await handlePicked(item) }
            }
        }
    }

    // MARK: Script

    private var scriptSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("SCRIPT").webSectionLabel()
                Spacer()
                Button {
                    Task { await runScriptGeneration() }
                } label: {
                    HStack(spacing: 6) {
                        if generatingScript {
                            ProgressView().tint(WebTheme.Color.accent2).scaleEffect(0.65)
                        } else {
                            Image(systemName: "wand.and.stars").font(.system(size: 11, weight: .semibold))
                        }
                        Text(generatingScript ? "Writing…" : "Generate with AI")
                            .font(WebTheme.Font.body(12))
                    }
                    .foregroundColor(WebTheme.Color.accent2)
                }
                .buttonStyle(.plain)
                .disabled(generatingScript)
            }
            WebTemplateTextEditor(
                text: $script,
                placeholder: "What the creator says. Generate one, or write your own.",
                minHeight: 90,
                focused: $focusedField,
                field: .script
            )
        }
    }

    // MARK: Tweaks

    private var tweaksSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 4) {
                Text("TWEAKS").webSectionLabel()
                Text("· optional").font(WebTheme.Font.body(11)).foregroundColor(.white.opacity(0.3))
            }
            WebModalField(
                text: $tweaks,
                placeholder: talking ? "e.g. have her smile and wave at the start" : "e.g. slower spin, warmer lighting"
            )
            .focused($focusedField, equals: .tweaks)
        }
    }

    // MARK: Captions

    private var captionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("CAPTIONS").webSectionLabel()
                Spacer()
                WebToggle(isOn: $captionsEnabled)
            }
            if captionsEnabled {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(CaptionPreset.all) { preset in
                            CaptionPreviewTile(
                                preset: preset,
                                selected: captionPresetId == preset.id,
                                onTap: { captionPresetId = preset.id }
                            )
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    // MARK: Generate

    private var generateButton: some View {
        Button {
            focusedField = nil
            guard let url = remoteUrl else { return }
            chatVM.startTemplateGeneration(
                target,
                productImageUrl: url,
                productName: productName,
                productDescription: productDescription,
                script: script,
                tweaks: tweaks,
                captionsEnabled: captionsEnabled,
                captionPresetId: captionPresetId
            )
        } label: {
            HStack(spacing: 8) {
                if chatVM.isGenerating {
                    ProgressView().tint(.black).scaleEffect(0.8)
                } else {
                    Image(systemName: "sparkles").font(.system(size: 13, weight: .semibold))
                }
                Text("Generate — \(target.credits) credits")
                    .font(WebTheme.Font.body(15, weight: .semibold))
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous).fill(Color.white))
            .opacity(remoteUrl == nil || uploading || chatVM.isGenerating ? 0.4 : 1)
        }
        .buttonStyle(WebPressStyle())
        .disabled(remoteUrl == nil || uploading || chatVM.isGenerating)
    }

    // MARK: Actions

    private func runScriptGeneration() async {
        generatingScript = true
        defer { generatingScript = false }
        if let s = await chatVM.generateScriptForTemplate(
            target, productName: productName, productDescription: productDescription
        ), !s.isEmpty {
            await MainActor.run { withAnimation(.easeOut(duration: 0.2)) { script = s } }
        }
    }

    private func handlePicked(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let img = UIImage(data: data) else { return }
        await MainActor.run {
            productImage = img
            remoteUrl = nil
            uploading = true
            uploadError = nil
            pickerItem = nil
        }
        do {
            let url = try await UGCService.shared.uploadAttachment(img)
            await MainActor.run { remoteUrl = url; uploading = false }
        } catch {
            await MainActor.run {
                productImage = nil
                uploading = false
                if case APIError.custom(let msg) = error, !msg.isEmpty {
                    uploadError = msg
                } else {
                    uploadError = "Upload failed — try another photo."
                }
            }
        }
    }
}

// MARK: - Single-line field

private struct WebModalField: View {
    @Binding var text: String
    let placeholder: String

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.3)))
            .font(WebTheme.Font.body(14))
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous).fill(Color.white.opacity(0.04)))
            .overlay(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
}

// MARK: - Multi-line editor (script)

private struct WebTemplateTextEditor<F: Hashable>: View {
    @Binding var text: String
    let placeholder: String
    let minHeight: CGFloat
    var focused: FocusState<F?>.Binding
    let field: F

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(WebTheme.Font.body(14))
                    .foregroundColor(.white.opacity(0.3))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .focused(focused, equals: field)
                .font(WebTheme.Font.body(14))
                .foregroundColor(.white)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(minHeight: minHeight)
        }
        .background(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous).fill(Color.white.opacity(0.04)))
        .overlay(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
}
