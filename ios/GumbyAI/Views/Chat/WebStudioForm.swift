import SwiftUI
import PhotosUI
import AVKit
import Photos

// MARK: - Studio form (port of web/components/studio/StudioForm.tsx)

/// The unified studio form. One prompt + up to five reference images, format
/// options, and a talking-creator toggle that reveals the script + captions.
/// "Generate" fires a single `/ugc/generate` call.
struct WebStudioForm: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var photoPickerItems: [PhotosPickerItem] = []
    @State private var showRights = false
    @FocusState private var promptFocused: Bool
    @FocusState private var scriptFocused: Bool

    private let creditCost: [Int: Int] = [5: 50, 10: 100]

    var body: some View {
        VStack(spacing: 16) {
            if chatVM.formCreatorImageUrl != nil {
                creatorCard
            }
            productSection
            formatSection
            talkingCreatorSection
            generateButton

            if let err = chatVM.formError, !err.isEmpty {
                Text(err)
                    .font(WebTheme.Font.body(13))
                    .foregroundColor(Color(hex: "FF453A"))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 24)
        .fullScreenCover(isPresented: $showRights) {
            RightsConfirmModal(
                imageCount: chatVM.formRemoteURLs.count,
                onConfirm: {
                    showRights = false
                    chatVM.confirmRightsAndGenerate()
                },
                onClose: { showRights = false }
            )
            .presentationBackground(.clear)
        }
    }

    // MARK: - Fixed creator card

    private var creatorCard: some View {
        HStack(spacing: 14) {
            Group {
                if let s = chatVM.formCreatorImageUrl, let url = URL(string: s) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase { img.resizable().scaledToFill() }
                        else { WebTheme.Color.elevated }
                    }
                } else {
                    WebTheme.Color.elevated
                }
            }
            .frame(width: 56, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("CREATOR").webSectionLabel()
                Text(chatVM.formCreatorName ?? "Selected creator")
                    .font(WebTheme.Font.body(15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("Your ad will star this creator. Add your product and describe the scene below.")
                    .font(WebTheme.Font.body(11))
                    .foregroundColor(.white.opacity(0.45))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .webCard(fill: WebTheme.Color.studio)
    }

    // MARK: - Product ad (prompt + references)

    private var productSection: some View {
        WebStudioSection(
            title: "Your product ad",
            hint: chatVM.formCreatorImageUrl != nil
                ? "Upload your product and describe what this creator should do."
                : "Upload your product and describe the ad: the creator, the setting, the action."
        ) {
            VStack(alignment: .leading, spacing: 12) {
                WebTextEditor(
                    text: $chatVM.formPrompt,
                    placeholder: chatVM.formCreatorImageUrl != nil
                        ? "She holds my product up, smiles, and says how much she loves it. Bright, cozy setting."
                        : "The first image is the product. Render a young woman wearing/holding it in a setting you describe. She looks at the camera, smiles.",
                    minHeight: 120,
                    focused: $promptFocused
                )

                if !chatVM.formAttachments.isEmpty {
                    attachmentsGrid
                }

                HStack(spacing: 12) {
                    PhotosPicker(
                        selection: $photoPickerItems,
                        maxSelectionCount: max(0, ChatViewModel.MAX_ATTACHMENTS - chatVM.formAttachments.count),
                        matching: .images
                    ) {
                        HStack(spacing: 8) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 12, weight: .semibold))
                            Text(chatVM.formAttachments.isEmpty ? "Add reference images" : "Add another")
                                .font(WebTheme.Font.body(12))
                        }
                        .foregroundColor(chatVM.formAttachments.count >= ChatViewModel.MAX_ATTACHMENTS
                                         ? .white.opacity(0.4) : .white.opacity(0.7))
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .overlay(Capsule().stroke(WebTheme.Color.border, lineWidth: 1))
                    }
                    .disabled(chatVM.formAttachments.count >= ChatViewModel.MAX_ATTACHMENTS)
                    .onChange(of: photoPickerItems) { _, items in
                        Task { await handlePicked(items) }
                    }

                    Text("Up to \(ChatViewModel.MAX_ATTACHMENTS) images. PNG, JPEG, or WebP.")
                        .font(WebTheme.Font.body(11))
                        .foregroundColor(.white.opacity(0.4))
                }
            }
        }
    }

    private var attachmentsGrid: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 5)
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(chatVM.formAttachments) { att in
                // `Color.clear.aspectRatio(1, .fit)` makes the cell a square
                // bounded by the column width, and the image fills it via
                // overlay + clip. (The previous `.aspectRatio(_, .fill)` let
                // the square grow past its cell, overflowing the screen.)
                Color.clear
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
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
                    }
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
                    .overlay(alignment: .topTrailing) {
                        Button {
                            chatVM.removeFormAttachment(id: att.id)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 18, height: 18)
                                .background(Circle().fill(Color.black.opacity(0.65)))
                                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                                .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        }
                        .buttonStyle(.plain)
                        .offset(x: 5, y: -5)
                    }
            }
        }
    }

    // MARK: - Format (duration + aspect)

    private var formatSection: some View {
        WebStudioSection(title: "Format", hint: "Duration and aspect ratio for the rendered clip.") {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("DURATION").webSectionLabel()
                    HStack(spacing: 0) {
                        ForEach([5, 10], id: \.self) { d in
                            Button {
                                chatVM.formDuration = d
                            } label: {
                                HStack(spacing: 4) {
                                    Text("\(d)s")
                                        .font(WebTheme.Font.body(13, weight: .semibold))
                                    Text("· \(creditCost[d] ?? 0)")
                                        .font(WebTheme.Font.body(11))
                                        .opacity(0.6)
                                }
                                .foregroundColor(chatVM.formDuration == d ? .black : .white.opacity(0.6))
                                .padding(.horizontal, 12)
                                .frame(height: 30)
                                .background(Capsule().fill(chatVM.formDuration == d ? Color.white : .clear))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(2)
                    .background(Capsule().fill(WebTheme.Color.elevated))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("ASPECT").webSectionLabel()
                    WebSegmentedPill(
                        options: ["9:16", "1:1", "16:9"],
                        selection: $chatVM.formAspectRatio,
                        label: { $0 },
                        height: 30,
                        fontSize: 13,
                        hPadding: 12
                    )
                }
            }
        }
    }

    // MARK: - Talking creator (script + captions)

    private var talkingCreatorSection: some View {
        WebStudioSection(
            title: "Talking creator",
            hint: chatVM.formCreatorSpeaks
                ? "The creator speaks a script on camera."
                : "Silent video — the creator won’t speak. No script, no captions.",
            action: {
                AnyView(
                    WebToggle(isOn: $chatVM.formCreatorSpeaks)
                )
            }
        ) {
            if chatVM.formCreatorSpeaks {
                VStack(alignment: .leading, spacing: 18) {
                    // Script
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("SCRIPT").webSectionLabel()
                            Spacer()
                            Button {
                                Task { await chatVM.generateScriptForForm() }
                            } label: {
                                HStack(spacing: 6) {
                                    if chatVM.formIsGeneratingScript {
                                        ProgressView().tint(WebTheme.Color.accent2).scaleEffect(0.65)
                                    } else {
                                        Image(systemName: "wand.and.stars")
                                            .font(.system(size: 11, weight: .semibold))
                                    }
                                    Text(chatVM.formIsGeneratingScript ? "Writing…" : "Generate with AI")
                                        .font(WebTheme.Font.body(12))
                                }
                                .foregroundColor(WebTheme.Color.accent2)
                            }
                            .buttonStyle(.plain)
                            .disabled(chatVM.formIsGeneratingScript)
                        }

                        Text("\(chatVM.formDuration)s of speech — keep it tight.")
                            .font(WebTheme.Font.body(12))
                            .foregroundColor(.white.opacity(0.45))

                        WebTextEditor(
                            text: $chatVM.formScript,
                            placeholder: "Okay so I just got this and honestly…",
                            minHeight: 100,
                            focused: $scriptFocused
                        )

                        if let err = chatVM.formScriptError {
                            Text(err)
                                .font(WebTheme.Font.body(12))
                                .foregroundColor(Color(hex: "FF453A"))
                        }
                    }

                    Divider().overlay(WebTheme.Color.borderSubtle)

                    // Captions
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("CAPTIONS").webSectionLabel()
                                Text(chatVM.formCaptionsEnabled
                                     ? "Pick the look — captions burn into the Reels safe zone."
                                     : "Clean video with no captions on screen.")
                                    .font(WebTheme.Font.body(12))
                                    .foregroundColor(.white.opacity(0.45))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 12)
                            WebToggle(isOn: $chatVM.formCaptionsEnabled)
                        }

                        if chatVM.formCaptionsEnabled {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(CaptionPreset.all) { preset in
                                        CaptionPreviewTile(
                                            preset: preset,
                                            selected: chatVM.formCaptionPresetId == preset.id,
                                            onTap: { chatVM.formCaptionPresetId = preset.id }
                                        )
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Generate

    private var generateButton: some View {
        Button {
            promptFocused = false
            scriptFocused = false
            chatVM.attemptGenerate(showRights: { showRights = true })
        } label: {
            HStack(spacing: 8) {
                if chatVM.isGenerating {
                    Text("Generating…")
                        .font(WebTheme.Font.body(16, weight: .semibold))
                } else {
                    Text("Generate")
                        .font(WebTheme.Font.body(16, weight: .semibold))
                    Text("\(creditCost[chatVM.formDuration] ?? 0) credits")
                        .font(WebTheme.Font.body(12, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.white.opacity(0.1)))
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .fill(Color.black)
            )
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .stroke(WebTheme.Color.border, lineWidth: 1)
            )
            .opacity(chatVM.isGenerating ? 0.4 : 1)
        }
        .buttonStyle(WebPressStyle())
        .disabled(chatVM.isGenerating)
    }

    // MARK: - Photo handoff

    private func handlePicked(_ items: [PhotosPickerItem]) async {
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                await MainActor.run { chatVM.addFormAttachment(img) }
            }
        }
        await MainActor.run { photoPickerItems = [] }
    }
}

// MARK: - Section container (web's <Section>)

struct WebStudioSection<Content: View>: View {
    let title: String
    var hint: String? = nil
    var action: (() -> AnyView)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(WebTheme.Font.body(14, weight: .semibold))
                        .foregroundColor(.white)
                    if let hint {
                        Text(hint)
                            .font(WebTheme.Font.body(12))
                            .foregroundColor(.white.opacity(0.45))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                if let action { action() }
            }
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .webCard(fill: WebTheme.Color.studio)
    }
}

// MARK: - Toggle (web accent switch)

struct WebToggle: View {
    @Binding var isOn: Bool
    var body: some View {
        Button {
            withAnimation(.easeOut(duration: 0.18)) { isOn.toggle() }
        } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                Capsule()
                    .fill(isOn ? WebTheme.Color.accent2 : Color.white.opacity(0.15))
                    .frame(width: 44, height: 24)
                Circle()
                    .fill(Color.white)
                    .frame(width: 20, height: 20)
                    .padding(.horizontal, 2)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Multi-line editor with placeholder

struct WebTextEditor: View {
    @Binding var text: String
    let placeholder: String
    let minHeight: CGFloat
    var focused: FocusState<Bool>.Binding

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(WebTheme.Font.body(14))
                    .foregroundColor(WebTheme.Color.placeholder)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
                .frame(minHeight: minHeight)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .font(WebTheme.Font.body(14))
                .foregroundColor(.white)
                .tint(.white)
                .focused(focused)
        }
        .background(
            RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                .fill(WebTheme.Color.composerInner)
        )
        .overlay(
            RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                .stroke(focused.wrappedValue ? WebTheme.Color.accent2.opacity(0.5) : WebTheme.Color.borderSubtle,
                        lineWidth: 1)
        )
    }
}

// MARK: - Generating view (port of GeneratingCard.tsx + studio generating screen)

struct WebGeneratingAdView: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        // The progress screen now lives in `GeneratingProgressView` so the
        // exact same screen can be shown when an in-flight job is reopened
        // from History/Recents (see UGCVideoPlayerSheet).
        GeneratingProgressView(
            status: chatVM.activeJob?.status,
            progress: chatVM.activeJob?.progress ?? 0
        )
    }
}

// MARK: - Done view (port of VideoResult.tsx + ad_done screen)

struct WebAdDoneView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

    private var videoURL: String? { chatVM.activeJob?.outputVideoURL }

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                Text("DONE").webSectionLabel()
                    .foregroundColor(WebTheme.Color.accent2)
                Text("Your UGC ad is ready.")
                    .font(WebTheme.Font.display(26, weight: .bold))
                    .foregroundColor(.white)
            }
            .padding(.top, 24)
            .padding(.bottom, 24)

            videoCard
                .frame(maxWidth: 260)

            HStack(spacing: 8) {
                actionButton(title: "Download", icon: "square.and.arrow.down", filled: true) {
                    Task { await saveToPhotos() }
                }
                .disabled(saving)
                actionButton(title: nil, icon: "square.and.arrow.up", filled: false) { showShare = true }
                actionButton(title: nil, icon: "arrow.counterclockwise", filled: false) {
                    chatVM.regenerateFromResult()
                }
            }
            .frame(maxWidth: 260)
            .padding(.top, 16)

            if let msg = saveMessage {
                Text(msg)
                    .font(WebTheme.Font.body(12))
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.top, 8)
            }

            Button {
                chatVM.newConversation()
            } label: {
                Text("Make another ad")
                    .font(WebTheme.Font.body(15, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .frame(height: 48)
                    .background(
                        RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                            .fill(Color.black)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                            .stroke(WebTheme.Color.border, lineWidth: 1)
                    )
            }
            .buttonStyle(WebPressStyle())
            .padding(.top, 28)
        }
        .padding(.horizontal, 14)
        .onAppear {
            if let s = videoURL, let url = URL(string: s) {
                let p = AVPlayer(url: url)
                p.isMuted = false
                p.play()
                player = p
            }
        }
        .onDisappear { player?.pause() }
        .sheet(isPresented: $showShare) {
            if let s = videoURL, let url = URL(string: s) {
                WebShareSheet(items: [url])
            }
        }
    }

    private var videoCard: some View {
        ZStack {
            Color.black
            if let player {
                VideoPlayer(player: player)
            }
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: WebTheme.Radius.card, style: .continuous)
                .stroke(WebTheme.Color.border, lineWidth: 1)
        )
    }

    private func actionButton(title: String?, icon: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if saving && title == "Download" {
                    ProgressView().tint(filled ? .black : .white).scaleEffect(0.8)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .semibold))
                }
                if let title {
                    Text(title).font(WebTheme.Font.body(14, weight: .semibold))
                }
            }
            .foregroundColor(filled ? .black : .white)
            .frame(maxWidth: title != nil ? .infinity : nil)
            .frame(width: title == nil ? 48 : nil, height: 44)
            .padding(.horizontal, title != nil ? 12 : 0)
            .background(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .fill(filled ? Color.white : Color.white.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .stroke(filled ? Color.clear : WebTheme.Color.border, lineWidth: 1)
            )
        }
        .buttonStyle(WebPressStyle())
    }

    private func saveToPhotos() async {
        guard let s = videoURL, let url = URL(string: s) else { return }
        saving = true
        defer { saving = false }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(chatVM.activeJob?.id ?? UUID().uuidString).mp4")
            try data.write(to: tmp)
            let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            guard status == .authorized || status == .limited else {
                saveMessage = "Photos access denied."
                return
            }
            try await PHPhotoLibrary.shared().performChanges {
                let req = PHAssetCreationRequest.forAsset()
                req.addResource(with: .video, fileURL: tmp, options: nil)
            }
            saveMessage = "Saved to Photos."
        } catch {
            saveMessage = "Couldn't save: \(error.localizedDescription)"
        }
    }
}

private struct WebShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
