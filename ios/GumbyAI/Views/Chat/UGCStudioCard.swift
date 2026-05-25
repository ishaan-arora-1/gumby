import SwiftUI
import PhotosUI

/// The combined editable form card used in the studio view. Contains all
/// fields (product, script, B-roll shots, voice) in a single spacious card.
/// Clean, minimal aesthetic — no gradients, neutral tones.
struct UGCStudioCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int

    private var draft: UGCDraft {
        chatVM.drafts[draftIndex]
    }

    /// True when no template is selected — the user typed a direct prompt
    /// and the creator description lives in the draft instead.
    private var isDirectMode: Bool {
        chatVM.pickedTemplate == nil
    }

    var body: some View {
        if chatVM.drafts.indices.contains(draftIndex) {
            cardBody
        }
    }

    @ViewBuilder
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            draftHeader
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 20)

            // Creator description (direct mode only — no template selected)
            if isDirectMode {
                creatorSection
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)

                sectionDivider
            }

            productToggleSection
                .padding(.horizontal, 20)
                .padding(.bottom, 24)

            sectionDivider

            scriptSection
                .padding(.horizontal, 20)
                .padding(.vertical, 24)

            sectionDivider

            shotsSection
                .padding(.horizontal, 20)
                .padding(.vertical, 24)

            sectionDivider

            generateButton
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 22)
        }
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "161616"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    // MARK: - Divider

    private var sectionDivider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.05))
            .frame(height: 1)
            .padding(.horizontal, 20)
    }

    // MARK: - Draft header

    private var draftHeader: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(draft.number == 1 ? "Create your ad" : "Draft \(draft.number)")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                Text("Fill in the details below to generate your video.")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "6B6B6B"))
            }
            Spacer()
        }
    }

    // MARK: - Creator (direct mode)

    private var creatorSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Creator")

            Text("Describe the person in your video — their look, age, and setting.")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "6B6B6B"))

            ZStack(alignment: .topLeading) {
                if draft.creatorDescription.isEmpty {
                    Text("e.g. 20-year-old athletic woman in a bright modern kitchen")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "4A4A4A"))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 13)
                        .allowsHitTesting(false)
                }
                TextEditor(text: Binding(
                    get: { chatVM.drafts[draftIndex].creatorDescription },
                    set: { chatVM.drafts[draftIndex].creatorDescription = $0 }
                ))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 76)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .foregroundColor(.white)
                .font(.system(size: 14))
            }
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: "111111"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )

            // Inspiration image picker — optional. The backend takes the
            // photo, swaps the subject for the described creator (Flux
            // Kontext Pro), and uses the result as the seed frame for
            // Kling 3.0 Pro image-to-video.
            inspirationPicker
        }
    }

    private var inspirationPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Inspiration photo")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "6B6B6B"))
                Text("optional")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(hex: "4A4A4A"))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(Color.white.opacity(0.05))
                    )
                Spacer()
                if draft.inspirationImage != nil || draft.inspirationImageURL != nil {
                    Button {
                        chatVM.clearInspirationImageForActiveDraft()
                    } label: {
                        Text("Remove")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .buttonStyle(.plain)
                }
            }

            Text("Drop a photo of a scene — we'll recreate it with your creator.")
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "4A4A4A"))

            HStack(alignment: .top, spacing: 12) {
                StudioInspirationPickerSection(draftIndex: draftIndex)

                VStack(alignment: .leading, spacing: 4) {
                    Text(draft.inspirationImage != nil || draft.inspirationImageURL != nil
                         ? "We'll preserve this environment and swap the person to match your creator description."
                         : "Tap to attach an image. We'll keep the setting and put your creator into it.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "6B6B6B"))
                        .lineLimit(4)
                }
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Product (with toggle)

    private var productToggleSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                sectionLabel("Product")
                Spacer()
                Toggle("", isOn: Binding(
                    get: { chatVM.drafts[draftIndex].includeProduct },
                    set: { chatVM.drafts[draftIndex].includeProduct = $0 }
                ))
                .labelsHidden()
                .tint(Color.white)
                .scaleEffect(0.8)
            }

            if draft.includeProduct {
                productFields
            } else {
                Text("No product — video will focus on the creator and script only.")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "6B6B6B"))
            }
        }
    }

    private var productFields: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                StudioPhotoPickerSection(draftIndex: draftIndex)

                VStack(spacing: 12) {
                    studioField(
                        label: "Product name",
                        text: Binding(
                            get: { chatVM.drafts[draftIndex].productName },
                            set: { chatVM.drafts[draftIndex].productName = $0 }
                        ),
                        placeholder: "e.g. GlowOil Vitamin C Serum"
                    )
                    studioField(
                        label: "Tone",
                        text: Binding(
                            get: { chatVM.drafts[draftIndex].productTone },
                            set: { chatVM.drafts[draftIndex].productTone = $0 }
                        ),
                        placeholder: "e.g. playful, premium"
                    )
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Description")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "6B6B6B"))
                ZStack(alignment: .topLeading) {
                    if draft.productDescription.isEmpty {
                        Text("What does the product do?")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "4A4A4A"))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 13)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: Binding(
                        get: { chatVM.drafts[draftIndex].productDescription },
                        set: { chatVM.drafts[draftIndex].productDescription = $0 }
                    ))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 76)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .foregroundColor(.white)
                    .font(.system(size: 14))
                }
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(hex: "111111"))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Script

    private var scriptSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                sectionLabel("Script")
                Spacer()
                Button {
                    Task { await chatVM.generateScriptForActiveDraft() }
                } label: {
                    HStack(spacing: 5) {
                        if draft.isGeneratingScript {
                            ProgressView().scaleEffect(0.65).tint(Color(hex: "8E8E93"))
                        } else {
                            Image(systemName: "sparkles")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        Text(draft.script.isEmpty ? "Write with AI" : "Rewrite")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white.opacity(0.8))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(
                        Capsule().fill(Color.white.opacity(0.08))
                    )
                    .overlay(Capsule().stroke(Color.white.opacity(0.06), lineWidth: 1))
                }
                .disabled(draft.isGeneratingScript)
                .opacity(draft.isGeneratingScript ? 0.6 : 1)
            }

            ZStack(alignment: .topLeading) {
                if draft.script.isEmpty && !draft.isGeneratingScript {
                    Text("Type the script or let AI write it for you…")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "4A4A4A"))
                        .padding(.horizontal, 15)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }

                if draft.isGeneratingScript && draft.script.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView().tint(.white.opacity(0.6)).scaleEffect(0.8)
                        Text("Writing…")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.6))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                }

                TextEditor(text: Binding(
                    get: { chatVM.drafts[draftIndex].script },
                    set: { chatVM.drafts[draftIndex].script = $0 }
                ))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 130)
                .padding(10)
                .foregroundColor(.white)
                .font(.system(size: 14))
            }
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: "111111"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )

            if let err = draft.scriptError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "FF453A"))
            }
        }
    }

    // MARK: - Video description + duration

    private var shotsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionLabel("Video")

            Text("Describe what you want the creator doing in the video. We'll handle the rest.")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "6B6B6B"))

            ZStack(alignment: .topLeading) {
                if draft.videoDescription.isEmpty {
                    Text(draft.includeProduct
                         ? "e.g. Creator picks up the product, shows it to camera, uses it and reacts"
                         : "e.g. Creator talks to camera, gestures expressively, smiles and leans in")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "4A4A4A"))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 13)
                        .allowsHitTesting(false)
                }
                TextEditor(text: Binding(
                    get: { chatVM.drafts[draftIndex].videoDescription },
                    set: { chatVM.drafts[draftIndex].videoDescription = $0 }
                ))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 90)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .foregroundColor(.white)
                .font(.system(size: 14))
            }
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(hex: "111111"))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )

            // Duration picker
            VStack(alignment: .leading, spacing: 10) {
                Text("Duration")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "6B6B6B"))

                HStack(spacing: 8) {
                    ForEach([5, 10], id: \.self) { seconds in
                        durationChip(seconds: seconds)
                    }
                    Spacer()
                }
            }
        }
    }

    private func durationChip(seconds: Int) -> some View {
        let isSelected = draft.videoDuration == seconds
        return Button {
            chatVM.drafts[draftIndex].videoDuration = seconds
        } label: {
            VStack(spacing: 3) {
                Text("\(seconds)s")
                    .font(.system(size: 14, weight: .semibold))
                Text(seconds == 5 ? "Short" : "Standard")
                    .font(.system(size: 10))
                    .foregroundColor(isSelected ? .black.opacity(0.5) : .white.opacity(0.4))
            }
            .foregroundColor(isSelected ? .black : .white.opacity(0.8))
            .frame(width: 80)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isSelected ? Color.white : Color.white.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(isSelected ? Color.clear : Color.white.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Generate button

    private var generateButton: some View {
        VStack(spacing: 8) {
            if let err = draft.submitError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "FF453A"))
            }

            Button {
                chatVM.generateForActiveDraft()
            } label: {
                HStack(spacing: 8) {
                    if draft.isSubmitting {
                        ProgressView().tint(.black)
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    Text(draft.isSubmitting ? "Starting…" : "Generate")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundColor(draft.canGenerate && !draft.isSubmitting ? .black : .white.opacity(0.3))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(draft.canGenerate && !draft.isSubmitting
                              ? Color.white
                              : Color.white.opacity(0.06))
                )
            }
            .disabled(!draft.canGenerate || draft.isSubmitting)
        }
    }

    // MARK: - Helpers

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(hex: "8E8E93"))
            .textCase(.uppercase)
            .tracking(0.8)
    }

    private func studioField(label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: "6B6B6B"))
            TextField("", text: text, prompt: Text(placeholder).foregroundColor(Color(hex: "4A4A4A")))
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(hex: "111111"))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        }
    }

    private func studioSmallButton(label: String, icon: String, isLoading: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if isLoading {
                    ProgressView().controlSize(.small).tint(.white.opacity(0.6))
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 11, weight: .semibold))
                }
                Text(label)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(.white.opacity(0.7))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.white.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

}

// MARK: - Studio photo picker (scoped to active draft)

struct StudioPhotoPickerSection: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int

    var body: some View {
        if chatVM.drafts.indices.contains(draftIndex) {
            pickerBody
        }
    }

    @ViewBuilder
    private var pickerBody: some View {
        let image = chatVM.drafts[draftIndex].productImage
        let urlString = chatVM.drafts[draftIndex].productImageURL
        PhotosPicker(
            selection: Binding(
                get: { chatVM.drafts[draftIndex].productPhotoItem },
                set: { chatVM.drafts[draftIndex].productPhotoItem = $0 }
            ),
            matching: .images
        ) {
            StudioPhotoThumb(image: image, urlString: urlString)
        }
        .onChange(of: chatVM.drafts[draftIndex].productPhotoItem) { _, _ in
            Task { await chatVM.loadProductPhotoForActiveDraft() }
        }
    }
}

private struct StudioPhotoThumb: View {
    let image: UIImage?
    let urlString: String?

    var body: some View {
        ZStack {
            if let img = image {
                Image(uiImage: img).resizable().scaledToFill()
            } else if let urlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Color(hex: "111111") }
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.4))
                    Text("Photo")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.3))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: "111111"))
            }
        }
        .frame(width: 88, height: 88)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
}

// MARK: - Inspiration photo picker (scoped to active draft)
//
// The user picks one image describing the scene they want. Backend swaps the
// subject for the described creator (Flux Kontext Pro), then seeds Kling 3.0
// Pro image-to-video with the synthesized still. Sized larger than the
// product thumb so the picker reads as a primary CTA, not an afterthought.

struct StudioInspirationPickerSection: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int

    var body: some View {
        if chatVM.drafts.indices.contains(draftIndex) {
            pickerBody
        }
    }

    @ViewBuilder
    private var pickerBody: some View {
        let image = chatVM.drafts[draftIndex].inspirationImage
        let urlString = chatVM.drafts[draftIndex].inspirationImageURL
        PhotosPicker(
            selection: Binding(
                get: { chatVM.drafts[draftIndex].inspirationPhotoItem },
                set: { chatVM.drafts[draftIndex].inspirationPhotoItem = $0 }
            ),
            matching: .images
        ) {
            StudioInspirationThumb(image: image, urlString: urlString)
        }
        .onChange(of: chatVM.drafts[draftIndex].inspirationPhotoItem) { _, _ in
            Task { await chatVM.loadInspirationPhotoForActiveDraft() }
        }
    }
}

private struct StudioInspirationThumb: View {
    let image: UIImage?
    let urlString: String?

    var body: some View {
        ZStack {
            if let img = image {
                Image(uiImage: img).resizable().scaledToFill()
            } else if let urlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Color(hex: "111111") }
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "sparkles.rectangle.stack")
                        .font(.system(size: 22))
                        .foregroundColor(.white.opacity(0.45))
                    Text("Add scene")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: "111111"))
            }
        }
        .frame(width: 110, height: 110)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}
