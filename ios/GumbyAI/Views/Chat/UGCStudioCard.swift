import SwiftUI
import PhotosUI

/// The combined editable form card used in the studio view. Contains all
/// fields (product, script, video, voice) grouped into rounded sub-cards
/// with a sticky Generate bar pinned to the bottom of the card.
struct UGCStudioCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int

    /// Swap this to retint every focus ring, chip, icon and the Generate button.
    static let accent = Color(hex: "7C5CFF")

    private enum Field: Hashable {
        case creator, creatorTweaks, productName, productTone, productDesc, script, video
    }
    @FocusState private var focused: Field?

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
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    stickyGenerateBar
                }
        }
    }

    @ViewBuilder
    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            draftHeader
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 4)

            if isDirectMode {
                subCard(title: "Creator", systemImage: "person.crop.circle") {
                    creatorSection
                }
            } else {
                subCard(title: "Creator tweaks", systemImage: "wand.and.stars") {
                    creatorTweaksSection
                }
            }

            subCard(title: "Product", systemImage: "shippingbox", trailing: {
                AnyView(
                    Toggle("", isOn: Binding(
                        get: { chatVM.drafts[draftIndex].includeProduct },
                        set: { chatVM.drafts[draftIndex].includeProduct = $0 }
                    ))
                    .labelsHidden()
                    .tint(Self.accent)
                    .scaleEffect(0.8)
                )
            }) {
                productSection
            }

            subCard(title: "Script", systemImage: "text.alignleft", trailing: {
                AnyView(writeWithAIButton)
            }) {
                scriptSection
            }

            subCard(title: "Video", systemImage: "video") {
                shotsSection
            }
        }
        .padding(.bottom, 12)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "161616"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .animation(.easeOut(duration: 0.2), value: focused)
        .animation(.easeOut(duration: 0.2), value: draft.includeProduct)
    }

    // MARK: - Sub-card container

    @ViewBuilder
    private func subCard<Content: View>(
        title: String,
        systemImage: String,
        trailing: (() -> AnyView)? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Self.accent.opacity(0.8))
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: "C7C7CC"))
                    .textCase(.uppercase)
                    .tracking(0.8)
                Spacer()
                if let trailing { trailing() }
            }
            content()
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(hex: "1C1C1C"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .padding(.horizontal, 14)
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
        let hasInspiration = draft.inspirationImage != nil || draft.inspirationImageURL != nil
        return VStack(alignment: .leading, spacing: 14) {
            inspirationPicker

            Text(hasInspiration
                 ? "Tell us who is on camera and any tweaks for the photo above (clothing, mood, swap the person, etc.). Always included in the prompt."
                 : "Describe the person and the whole scene — their look, age, and setting. Always included in the prompt.")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "6B6B6B"))

            FocusEditor(
                text: Binding(
                    get: { chatVM.drafts[draftIndex].creatorDescription },
                    set: { chatVM.drafts[draftIndex].creatorDescription = $0 }
                ),
                label: "Creator description",
                placeholder: hasInspiration
                    ? "e.g. Same setting but a 20-year-old woman in a hoodie holding a coffee"
                    : "e.g. 20-year-old athletic woman in a bright modern kitchen",
                minHeight: 76,
                isFocused: focused == .creator
            )
            .focused($focused, equals: .creator)
        }
    }

    // MARK: - Creator tweaks (template mode)

    private var creatorTweaksSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Optional. Same creator from the template, but with adjustments — e.g. on a beach, in casual streetwear, different lighting. Their face and identity stay the same.")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "6B6B6B"))

            FocusEditor(
                text: Binding(
                    get: { chatVM.drafts[draftIndex].creatorTweaks },
                    set: { chatVM.drafts[draftIndex].creatorTweaks = $0 }
                ),
                label: "Creator tweaks",
                placeholder: "Same person but outdoors on a sunny beach instead of indoors…",
                minHeight: 64,
                isFocused: focused == .creatorTweaks
            )
            .focused($focused, equals: .creatorTweaks)
        }
    }

    private var inspirationPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Inspiration photo")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8E8E93"))
                Text("optional")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(hex: "6B6B6B"))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.white.opacity(0.06)))
                Spacer()
                if draft.inspirationImage != nil || draft.inspirationImageURL != nil {
                    Button {
                        chatVM.clearInspirationImageForActiveDraft()
                    } label: {
                        Text("Remove")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.55))
                    }
                    .buttonStyle(PressableStyle())
                }
            }

            HStack(alignment: .top, spacing: 12) {
                StudioInspirationPickerSection(draftIndex: draftIndex)

                VStack(alignment: .leading, spacing: 4) {
                    Text(draft.inspirationImage != nil || draft.inspirationImageURL != nil
                         ? "We'll preserve this environment and swap the person to match your creator description."
                         : "Tap to attach an image. We'll keep the setting and put your creator into it.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8E8E93"))
                        .lineLimit(4)
                }
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Product

    private var productSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if draft.includeProduct {
                HStack(alignment: .top, spacing: 14) {
                    StudioPhotoPickerSection(draftIndex: draftIndex)

                    VStack(spacing: 10) {
                        FloatingLabelField(
                            label: "Product name",
                            placeholder: "e.g. GlowOil Vitamin C Serum",
                            text: Binding(
                                get: { chatVM.drafts[draftIndex].productName },
                                set: { chatVM.drafts[draftIndex].productName = $0 }
                            ),
                            isFocused: focused == .productName
                        )
                        .focused($focused, equals: .productName)

                        FloatingLabelField(
                            label: "Tone",
                            placeholder: "e.g. playful, premium",
                            text: Binding(
                                get: { chatVM.drafts[draftIndex].productTone },
                                set: { chatVM.drafts[draftIndex].productTone = $0 }
                            ),
                            isFocused: focused == .productTone
                        )
                        .focused($focused, equals: .productTone)
                    }
                }

                FocusEditor(
                    text: Binding(
                        get: { chatVM.drafts[draftIndex].productDescription },
                        set: { chatVM.drafts[draftIndex].productDescription = $0 }
                    ),
                    label: "Description",
                    placeholder: "What does the product do?",
                    minHeight: 76,
                    isFocused: focused == .productDesc
                )
                .focused($focused, equals: .productDesc)
            } else {
                Text("No product — video will focus on the creator and script only.")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "8E8E93"))
            }
        }
    }

    // MARK: - Script

    private var writeWithAIButton: some View {
        Button {
            Task { await chatVM.generateScriptForActiveDraft() }
        } label: {
            HStack(spacing: 5) {
                if draft.isGeneratingScript {
                    ProgressView().scaleEffect(0.65).tint(Self.accent)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Self.accent)
                }
                Text(draft.script.isEmpty ? "Write with AI" : "Rewrite")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(Self.accent.opacity(0.14)))
            .overlay(Capsule().stroke(Self.accent.opacity(0.35), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
        .disabled(draft.isGeneratingScript)
        .opacity(draft.isGeneratingScript ? 0.6 : 1)
    }

    private var scriptSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            FocusEditor(
                text: Binding(
                    get: { chatVM.drafts[draftIndex].script },
                    set: { chatVM.drafts[draftIndex].script = $0 }
                ),
                label: "Script",
                placeholder: "Type the script or let AI write it for you…",
                minHeight: 130,
                isFocused: focused == .script,
                overlay: {
                    AnyView(
                        Group {
                            if draft.isGeneratingScript && draft.script.isEmpty {
                                HStack(spacing: 10) {
                                    ProgressView().tint(Self.accent).scaleEffect(0.8)
                                    Text("Writing…")
                                        .font(.system(size: 14))
                                        .foregroundColor(.white.opacity(0.6))
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 16)
                            }
                        }
                    )
                }
            )
            .focused($focused, equals: .script)

            if let err = draft.scriptError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "FF453A"))
            }
        }
    }

    // MARK: - Video description + duration

    private var shotsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Describe what you want the creator doing in the video. We'll handle the rest.")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "8E8E93"))

            FocusEditor(
                text: Binding(
                    get: { chatVM.drafts[draftIndex].videoDescription },
                    set: { chatVM.drafts[draftIndex].videoDescription = $0 }
                ),
                label: "Video description",
                placeholder: draft.includeProduct
                    ? "e.g. Creator picks up the product, shows it to camera, uses it and reacts"
                    : "e.g. Creator talks to camera, gestures expressively, smiles and leans in",
                minHeight: 90,
                isFocused: focused == .video
            )
            .focused($focused, equals: .video)

            VStack(alignment: .leading, spacing: 10) {
                Text("Duration")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "8E8E93"))

                SegmentedDuration(
                    selected: Binding(
                        get: { chatVM.drafts[draftIndex].videoDuration },
                        set: { chatVM.drafts[draftIndex].videoDuration = $0 }
                    )
                )
            }

            captionsToggleRow
        }
    }

    private var captionsToggleRow: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Captions")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Text(draft.captionsEnabled
                         ? "Pick a look. Captions burn into the Reels safe zone."
                         : "Clean video — no captions on screen.")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "8E8E93"))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                Toggle("", isOn: Binding(
                    get: { chatVM.drafts[draftIndex].captionsEnabled },
                    set: { chatVM.drafts[draftIndex].captionsEnabled = $0 }
                ))
                .labelsHidden()
                .tint(Self.accent)
            }
            if draft.captionsEnabled {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(CaptionPreset.all) { preset in
                            CaptionPreviewTile(
                                preset: preset,
                                selected: draft.captionPresetId == preset.id,
                                onTap: {
                                    chatVM.drafts[draftIndex].captionPresetId = preset.id
                                }
                            )
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Sticky generate bar

    private var stickyGenerateBar: some View {
        VStack(spacing: 8) {
            if let err = draft.submitError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "FF453A"))
                    .padding(.horizontal, 18)
                    .padding(.top, 10)
            }

            HStack(spacing: 14) {
                ReadinessIndicator(
                    isDirectMode: isDirectMode,
                    includeProduct: draft.includeProduct,
                    creatorFilled: !draft.creatorDescription.isEmpty,
                    productFilled: !draft.productName.isEmpty,
                    scriptFilled: !draft.script.isEmpty,
                    videoFilled: !draft.videoDescription.isEmpty
                )

                Spacer()

                Button {
                    chatVM.generateForActiveDraft()
                } label: {
                    HStack(spacing: 8) {
                        if draft.isSubmitting {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "play.fill")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        Text(draft.isSubmitting ? "Starting…" : "Generate")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(draft.canGenerate && !draft.isSubmitting
                                     ? .white
                                     : .white.opacity(0.35))
                    .padding(.horizontal, 22)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(draft.canGenerate && !draft.isSubmitting
                                  ? Self.accent
                                  : Color.white.opacity(0.06))
                    )
                }
                .buttonStyle(PressableStyle())
                .disabled(!draft.canGenerate || draft.isSubmitting)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
        }
        .background(
            ZStack {
                Color(hex: "0E0E0E").opacity(0.85)
                Rectangle().fill(.ultraThinMaterial).opacity(0.6)
            }
        )
        .overlay(
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 1),
            alignment: .top
        )
        .animation(.easeOut(duration: 0.2), value: draft.canGenerate)
        .animation(.easeOut(duration: 0.2), value: draft.isSubmitting)
    }
}

// MARK: - Floating label single-line field

private struct FloatingLabelField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    let isFocused: Bool

    private var floats: Bool { isFocused || !text.isEmpty }

    var body: some View {
        ZStack(alignment: .leading) {
            // Floating label
            Text(label)
                .font(.system(size: floats ? 10 : 14, weight: floats ? .semibold : .regular))
                .foregroundColor(floats
                                 ? (isFocused ? UGCStudioCard.accent : Color(hex: "8E8E93"))
                                 : Color(hex: "6B6B6B"))
                .padding(.horizontal, 12)
                .offset(y: floats ? -14 : 0)
                .animation(.easeOut(duration: 0.18), value: floats)
                .animation(.easeOut(duration: 0.18), value: isFocused)

            TextField("", text: $text)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.top, floats ? 14 : 0)
                .animation(.easeOut(duration: 0.18), value: floats)
        }
        .frame(height: 50)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "111111"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isFocused ? UGCStudioCard.accent : Color.white.opacity(0.06),
                        lineWidth: isFocused ? 1.5 : 1)
        )
        .animation(.easeOut(duration: 0.18), value: isFocused)
    }
}

// MARK: - Multi-line editor with label-above + focus ring

private struct FocusEditor: View {
    @Binding var text: String
    let label: String
    let placeholder: String
    let minHeight: CGFloat
    let isFocused: Bool
    var overlay: (() -> AnyView)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isFocused ? UGCStudioCard.accent : Color(hex: "8E8E93"))
                .animation(.easeOut(duration: 0.18), value: isFocused)

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "4A4A4A"))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 13)
                        .allowsHitTesting(false)
                }
                if let overlay { overlay() }
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: minHeight)
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
                    .stroke(isFocused ? UGCStudioCard.accent : Color.white.opacity(0.06),
                            lineWidth: isFocused ? 1.5 : 1)
            )
            .animation(.easeOut(duration: 0.18), value: isFocused)
        }
    }
}

// MARK: - Segmented duration

private struct SegmentedDuration: View {
    @Binding var selected: Int
    private let options: [(seconds: Int, label: String)] = [(5, "Short"), (10, "Standard")]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.seconds) { option in
                Button {
                    selected = option.seconds
                } label: {
                    VStack(spacing: 2) {
                        Text("\(option.seconds)s")
                            .font(.system(size: 14, weight: .semibold))
                        Text(option.label)
                            .font(.system(size: 10))
                            .foregroundColor(selected == option.seconds
                                             ? .white.opacity(0.75)
                                             : .white.opacity(0.4))
                    }
                    .foregroundColor(selected == option.seconds ? .white : .white.opacity(0.8))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(selected == option.seconds
                                  ? UGCStudioCard.accent
                                  : Color.clear)
                    )
                }
                .buttonStyle(PressableStyle())
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(hex: "111111"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
        .animation(.easeOut(duration: 0.18), value: selected)
    }
}

// MARK: - Readiness indicator

private struct ReadinessIndicator: View {
    let isDirectMode: Bool
    let includeProduct: Bool
    let creatorFilled: Bool
    let productFilled: Bool
    let scriptFilled: Bool
    let videoFilled: Bool

    private var states: [Bool] {
        var s: [Bool] = []
        if isDirectMode { s.append(creatorFilled) }
        if includeProduct { s.append(productFilled) }
        s.append(scriptFilled)
        s.append(videoFilled)
        return s
    }

    var body: some View {
        let ready = states.filter { $0 }.count
        let total = states.count
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { i in
                    Circle()
                        .fill(states[i] ? UGCStudioCard.accent : Color.white.opacity(0.15))
                        .frame(width: 6, height: 6)
                }
            }
            Text("\(ready) of \(total) ready")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.55))
        }
        .animation(.easeOut(duration: 0.18), value: ready)
    }
}

// MARK: - Press scale style

private struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
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
        .buttonStyle(PressableStyle())
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
                        .foregroundColor(.white.opacity(0.45))
                    Text("Photo")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.35))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(hex: "111111"))
            }
        }
        .frame(width: 88, height: 88)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

// MARK: - Inspiration photo picker (scoped to active draft)

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
        .buttonStyle(PressableStyle())
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
                        .foregroundColor(UGCStudioCard.accent.opacity(0.8))
                    Text("Add scene")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.45))
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
