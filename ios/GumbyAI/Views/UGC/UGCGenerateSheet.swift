import SwiftUI
import PhotosUI

/// Bottom sheet that walks the user from "I want this template"
/// → product details → AI-generated script → voice → submit.
struct UGCGenerateSheet: View {
    let template: UGCTemplate
    @EnvironmentObject var ugcVM: UGCViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var productName: String = ""
    @State private var productDescription: String = ""
    @State private var tone: String = ""
    @State private var script: String = ""
    @State private var selectedVoiceId: String = ""

    @State private var pickerItem: PhotosPickerItem?
    @State private var productImage: UIImage?

    @State private var isGeneratingScript = false
    @State private var scriptError: String?
    @State private var isSubmitting = false
    @State private var submitError: String?

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    headerCard

                    productSection
                    scriptSection
                    voiceSection

                    submitButton
                        .padding(.top, 8)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        }
        .preferredColorScheme(.dark)
        .presentationDetents([.large])
        .onAppear {
            selectedVoiceId = template.voiceId
            if script.isEmpty { script = "" }
        }
        .onChange(of: pickerItem) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    await MainActor.run { productImage = img }
                }
            }
        }
    }

    // MARK: - Header

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Make this video your own")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundColor(.white)
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(AppConstants.chatComposerInner))
                }
            }
            .padding(.bottom, 14)

            HStack(spacing: 14) {
                ZStack {
                    AsyncImage(url: URL(string: template.thumbnailURL)) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.black
                    }
                }
                .frame(width: 80, height: 110)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(template.name)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("with \(template.actorName)")
                        .font(.system(size: 13))
                        .foregroundColor(AppConstants.textSecondary)
                    Text(template.setting)
                        .font(.system(size: 12))
                        .foregroundColor(AppConstants.textSecondary)
                        .lineLimit(2)
                    HStack(spacing: 6) {
                        Image(systemName: "clock")
                        Text("\(template.durationSeconds)s")
                        Text("·").foregroundColor(.white.opacity(0.4))
                        Text(template.aspectRatio)
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppConstants.textSecondary)
                    .padding(.top, 2)
                }
                Spacer()
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppConstants.chatComposerInner)
        )
    }

    // MARK: - Product

    private var productSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Your product", subtitle: "Tell us what they will be talking about")

            HStack(alignment: .top, spacing: 12) {
                productImagePicker
                VStack(spacing: 10) {
                    inputField(
                        label: "Product name",
                        text: $productName,
                        placeholder: "e.g. GlowOil Vitamin C Serum"
                    )
                    inputField(
                        label: "Brand tone (optional)",
                        text: $tone,
                        placeholder: "e.g. playful, premium, gen-z"
                    )
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("What it does")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                TextEditor(text: $productDescription)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 80)
                    .padding(10)
                    .foregroundColor(.white)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(AppConstants.chatComposerInner)
                    )
                    .overlay(alignment: .topLeading) {
                        if productDescription.isEmpty {
                            Text("e.g. brightens skin in 7 days, vegan, no fragrance, $24…")
                                .font(.system(size: 14))
                                .foregroundColor(AppConstants.chatPlaceholder)
                                .padding(.horizontal, 15)
                                .padding(.vertical, 18)
                                .allowsHitTesting(false)
                        }
                    }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
    }

    private var productImagePicker: some View {
        PhotosPicker(selection: $pickerItem, matching: .images) {
            ZStack {
                if let img = productImage {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 22))
                            .foregroundColor(.white.opacity(0.85))
                        Text("Photo")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.75))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(AppConstants.chatComposerInner)
                }
            }
            .frame(width: 92, height: 92)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(.white.opacity(0.08), lineWidth: 1)
            )
        }
    }

    // MARK: - Script

    private var scriptSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                sectionTitle("Script", subtitle: "What \(template.actorName) will say")
                Spacer()
                Button(action: generateScriptTapped) {
                    HStack(spacing: 6) {
                        if isGeneratingScript {
                            ProgressView().scaleEffect(0.8).tint(.white)
                        } else {
                            Image(systemName: "wand.and.stars")
                                .font(.system(size: 12, weight: .bold))
                        }
                        Text(script.isEmpty ? "Write with AI" : "Regenerate")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(AppConstants.accentGradient)
                    )
                }
                .disabled(productName.trimmingCharacters(in: .whitespaces).isEmpty || isGeneratingScript)
                .opacity(productName.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
            }

            TextEditor(text: $script)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 140)
                .padding(10)
                .foregroundColor(.white)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(AppConstants.chatComposerInner)
                )
                .overlay(alignment: .topLeading) {
                    if script.isEmpty {
                        Text("Tap \"Write with AI\" or type the spoken script yourself…")
                            .font(.system(size: 14))
                            .foregroundColor(AppConstants.chatPlaceholder)
                            .padding(.horizontal, 15)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                }

            if let scriptError {
                Text(scriptError)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }

            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                Text("Aim for ~\(template.durationSeconds) seconds (\(targetWordCount(for: template.durationSeconds)) words)")
            }
            .font(.system(size: 12))
            .foregroundColor(AppConstants.textSecondary)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
    }

    // MARK: - Voice

    private var voiceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Voice", subtitle: "Pick how they sound")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ugcVM.voices) { voice in
                        Button(action: { selectedVoiceId = voice.id }) {
                            Text(voice.label)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(selectedVoiceId == voice.id ? .black : .white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .background(
                                    Capsule().fill(selectedVoiceId == voice.id ? Color.white : AppConstants.chatComposerInner)
                                )
                        }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
    }

    // MARK: - Submit

    private var submitButton: some View {
        VStack(spacing: 8) {
            Button(action: submitTapped) {
                HStack(spacing: 10) {
                    if isSubmitting {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 18, weight: .bold))
                    }
                    Text(isSubmitting ? "Sending to studio…" : "Generate Video")
                        .font(.system(size: 16, weight: .heavy))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(canSubmit ? AnyShapeStyle(AppConstants.accentGradient) : AnyShapeStyle(Color.gray.opacity(0.3)))
                )
            }
            .disabled(!canSubmit || isSubmitting)

            if let submitError {
                Text(submitError)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            } else {
                Text("Takes ~30–90 seconds. We'll notify you when it's ready in My Videos.")
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var canSubmit: Bool {
        !productName.trimmingCharacters(in: .whitespaces).isEmpty
            && !script.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Actions

    private func generateScriptTapped() {
        scriptError = nil
        isGeneratingScript = true
        Task {
            defer { Task { @MainActor in isGeneratingScript = false } }
            do {
                let req = UGCService.ScriptRequest(
                    productName: productName,
                    productDescription: productDescription,
                    template: template,
                    tone: tone
                )
                let result = try await UGCService.shared.generateScript(req)
                await MainActor.run { script = result }
            } catch {
                await MainActor.run { scriptError = error.localizedDescription }
            }
        }
    }

    private func submitTapped() {
        submitError = nil
        isSubmitting = true
        Task {
            defer { Task { @MainActor in isSubmitting = false } }
            do {
                _ = try await ugcVM.submitGeneration(
                    template: template,
                    productName: productName,
                    productDescription: productDescription,
                    productImage: productImage,
                    script: script,
                    voiceId: selectedVoiceId.isEmpty ? template.voiceId : selectedVoiceId
                )
                await MainActor.run { dismiss() }
            } catch {
                await MainActor.run { submitError = error.localizedDescription }
            }
        }
    }

    // MARK: - Helpers

    private func sectionTitle(_ title: String, subtitle: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
            }
        }
    }

    private func inputField(label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppConstants.textSecondary)
            TextField("", text: text, prompt: Text(placeholder).foregroundColor(AppConstants.chatPlaceholder))
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(AppConstants.chatComposerInner)
                )
        }
    }

    private func targetWordCount(for seconds: Int) -> Int {
        max(20, Int(Double(seconds) * 2.4))
    }
}
