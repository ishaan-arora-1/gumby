import SwiftUI
import AVKit
import Photos

/// The iterative UGC studio — a scrollable stack of Card → Video → Card → Video
/// blocks. Each "draft" is one iteration of the user's ad generation. The first
/// draft starts empty; subsequent ones are cloned from the previous draft so the
/// user can tweak and regenerate without re-entering everything.
struct UGCStudioView: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(spacing: 14) {
            // Template hero banner (hidden in direct mode)
            if let template = chatVM.pickedTemplate {
                UGCChatTemplateSummaryCard(template: template)
                    .transition(.opacity)
            }

            // Stacked drafts
            ForEach(Array(chatVM.drafts.enumerated()), id: \.element.id) { index, draft in
                let isActive = index == chatVM.activeDraftIndex

                // Card
                switch draft.status {
                case .editing:
                    if isActive {
                        UGCStudioCard(draftIndex: index)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                            .id("card-\(draft.id)")
                    } else {
                        StudioCollapsedCard(draftIndex: index)
                            .transition(.opacity)
                    }

                case .generating:
                    StudioGeneratingCard(draftIndex: index)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                        .id("generating-\(draft.id)")

                case .completed, .failed:
                    StudioCollapsedCard(draftIndex: index)
                        .transition(.opacity)
                }

                // Video player (if completed)
                if let videoURL = draft.outputVideoURL {
                    StudioVideoPlayer(videoURL: videoURL, draftId: draft.id)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
                }

                // Failed error
                if draft.status == .failed, let err = draft.job?.error {
                    studioCard {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.red)
                                Text("Generation failed")
                                    .font(.system(size: 15, weight: .heavy))
                                    .foregroundColor(.white)
                            }
                            Text(err)
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                            Button {
                                chatVM.drafts[index].status = .editing
                                chatVM.drafts[index].job = nil
                                chatVM.activeDraftIndex = index
                            } label: {
                                Text("Edit and try again")
                                    .font(.system(size: 13, weight: .heavy))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 10)
                                    .background(
                                        Capsule()
                                            .fill(Color.white.opacity(0.06))
                                    )
                                    .overlay(
                                        Capsule()
                                            .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                                    )
                            }
                        }
                    }
                }

                // Regenerate button — only under the latest completed draft
                if draft.status == .completed && index == chatVM.drafts.count - 1 {
                    StudioRegenerateButton()
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
    }

    /// Shared card wrapper matching the studio aesthetic —
    /// dark fill, subtle border, no gradient.
    private func studioCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "161616"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        )
    }
}

// MARK: - Collapsed card (read-only summary of a completed/inactive draft)

private struct StudioCollapsedCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int

    private var draft: UGCDraft {
        chatVM.drafts[draftIndex]
    }

    var body: some View {
        if chatVM.drafts.indices.contains(draftIndex) {
            collapsedBody
        }
    }

    @ViewBuilder
    private var collapsedBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                // Status icon — solid white for completed, subtle for editing
                ZStack {
                    Circle()
                        .fill(draft.status == .completed
                              ? Color.white
                              : Color.white.opacity(0.10))
                        .frame(width: 28, height: 28)
                    Image(systemName: draft.status == .completed ? "checkmark" : "pencil")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundColor(draft.status == .completed ? Color(hex: "0A0A0A") : .white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Draft \(draft.number)")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundColor(.white)
                    if !draft.productName.isEmpty {
                        Text(draft.productName)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "8E8E93"))
                            .lineLimit(1)
                    }
                }
                Spacer()

                // Summary chips
                HStack(spacing: 6) {
                    if !draft.script.isEmpty {
                        summaryChip("text.bubble")
                    }
                    if !draft.videoDescription.isEmpty {
                        summaryChip("film")
                    }
                }
            }

            if !draft.script.isEmpty {
                Text(draft.script)
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 12) {
                if !draft.videoDescription.isEmpty {
                    Label {
                        Text("\(draft.videoDuration)s")
                            .font(.system(size: 11, weight: .semibold))
                    } icon: {
                        Image(systemName: "film")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(Color(hex: "6B6B6B"))
                }
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "161616"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func summaryChip(_ icon: String) -> some View {
        Image(systemName: icon)
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white.opacity(0.4))
            .frame(width: 24, height: 24)
            .background(Circle().fill(Color.white.opacity(0.06)))
    }
}

// MARK: - Generating card (progress display)

private struct StudioGeneratingCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let draftIndex: Int
    @State private var pulse = false
    @State private var tipIndex = 0

    // Locally simulated progress. The server progress jumps (0 → 72 → 100),
    // so we drive a smooth, time-based asymptotic curve that the server
    // value can only *pull forward*, then snap to 100 on completion.
    @State private var displayProgress: Double = 0
    @State private var animationTask: Task<Void, Never>?

    /// Mean expected duration. The asymptote constant `τ` ≈ duration / 2.7
    /// puts us at ~93% around the expected mark with smooth slowdown.
    private let estimatedSeconds: TimeInterval = 60

    private let tips = [
        "Composing your scene…",
        "Rendering the creator…",
        "Generating video and voice…",
        "Polishing lip-sync…",
        "Almost there…",
    ]

    private var draft: UGCDraft {
        chatVM.drafts[draftIndex]
    }

    var body: some View {
        if chatVM.drafts.indices.contains(draftIndex) {
            generatingBody
        }
    }

    @ViewBuilder
    private var generatingBody: some View {
        let status = draft.job?.status.displayLabel ?? "Queued"
        let percent = Int((displayProgress * 100).rounded())

        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                templatePoster
                    .frame(width: 72, height: 108)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
                    .scaleEffect(pulse ? 1.0 : 0.97)
                    .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: pulse)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Cooking Draft \(draft.number)…")
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundColor(.white)
                    Text(tips[tipIndex])
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "8E8E93"))
                        .transition(.opacity)
                        .id(tipIndex)
                }
                Spacer(minLength: 0)
            }

            // Progress bar — driven by `displayProgress`, ticked at ~30fps
            // by `runProgressAnimation` so the fill glides instead of jumps.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 6)
                    LinearGradient(
                        colors: [Color.white.opacity(0.85), Color.white],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: max(6, geo.size.width * displayProgress), height: 6)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .shadow(color: Color.white.opacity(0.35), radius: 6, x: 0, y: 0)
                }
            }
            .frame(height: 6)

            HStack {
                HStack(spacing: 6) {
                    Circle().fill(Color(hex: "34C759")).frame(width: 8, height: 8)
                    Text(status)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                }
                Spacer()
                Text("\(percent)%")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
                    .contentTransition(.numericText(value: Double(percent)))
                    .animation(.easeOut(duration: 0.15), value: percent)
            }

            Text("Usually takes 30–90 seconds. You can hang out here.")
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "6B6B6B"))
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "161616"))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
        )
        .onAppear {
            pulse = true
            startTipRotation()
            runProgressAnimation()
        }
        .onDisappear {
            animationTask?.cancel()
            animationTask = nil
        }
    }

    /// Drives `displayProgress` smoothly toward an asymptotic target on the
    /// main actor at ~30fps. The target is the max of (a) a time-based
    /// 1 - exp(-t/τ) curve capped at 0.95 and (b) the server-reported
    /// progress, so a real backend bump never causes regression. When the
    /// job completes we ease the remaining gap to 1.0 over ~0.6s.
    private func runProgressAnimation() {
        animationTask?.cancel()
        let start = Date()
        animationTask = Task { @MainActor in
            let tau = estimatedSeconds / 2.7
            while !Task.isCancelled {
                guard chatVM.drafts.indices.contains(draftIndex) else { break }
                let status = draft.job?.status

                if status == .completed {
                    await rampToCompletion()
                    break
                }
                if status == .failed { break }

                let elapsed = Date().timeIntervalSince(start)
                let timeBased = 1 - exp(-elapsed / tau)
                let serverPct = Double(draft.job?.progress ?? 0) / 100.0
                // Hold a sliver back for the completion snap.
                let target = min(0.95, max(timeBased, serverPct * 0.95))
                // Critically-damped ease toward target (≈12% of remaining
                // distance per ~33ms tick) — gives the bar a natural feel
                // without overshoot.
                displayProgress += (target - displayProgress) * 0.12
                try? await Task.sleep(nanoseconds: 33_000_000)
            }
        }
    }

    @MainActor
    private func rampToCompletion() async {
        let startValue = displayProgress
        let rampStart = Date()
        let duration: TimeInterval = 0.6
        while !Task.isCancelled {
            let t = min(1.0, Date().timeIntervalSince(rampStart) / duration)
            // Cubic ease-out
            let eased = 1 - pow(1 - t, 3)
            displayProgress = startValue + (1.0 - startValue) * eased
            if t >= 1.0 { break }
            try? await Task.sleep(nanoseconds: 16_000_000)
        }
        displayProgress = 1.0
    }

    @ViewBuilder
    private var templatePoster: some View {
        if let urlString = chatVM.pickedTemplate?.thumbnailURL,
           let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: { Color(hex: "111111") }
        } else {
            Color(hex: "111111")
        }
    }

    private func startTipRotation() {
        Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        tipIndex = (tipIndex + 1) % tips.count
                    }
                }
            }
        }
    }
}

// MARK: - Video player (full-width result for a completed draft)

private struct StudioVideoPlayer: View {
    let videoURL: String
    let draftId: UUID
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

    var body: some View {
        VStack(spacing: 12) {
            // Video
            ZStack {
                Color(hex: "111111")
                if let player {
                    VideoPlayer(player: player)
                } else {
                    Color.clear.onAppear {
                        if let url = URL(string: videoURL) {
                            player = AVPlayer(url: url)
                            player?.play()
                        }
                    }
                }
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.5), radius: 24, y: 10)

            // Action buttons
            HStack(spacing: 10) {
                studioActionButton(label: "Save", icon: "square.and.arrow.down") {
                    Task { await saveToPhotos() }
                }
                .disabled(saving)

                studioActionButton(label: "Share", icon: "square.and.arrow.up") {
                    showShare = true
                }
            }

            if let msg = saveMessage {
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "6B6B6B"))
                    .transition(.opacity)
            }
        }
        .sheet(isPresented: $showShare) {
            if let url = URL(string: videoURL) {
                StudioShareSheet(items: [url])
            }
        }
    }

    private func studioActionButton(label: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if saving && label == "Save" {
                    ProgressView().tint(.white).scaleEffect(0.8)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 13, weight: .heavy))
                }
                Text(label)
                    .font(.system(size: 13, weight: .heavy))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
    }

    private func saveToPhotos() async {
        guard let url = URL(string: videoURL) else { return }
        saving = true
        defer { saving = false }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(draftId.uuidString).mp4")
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

// MARK: - Regenerate button

private struct StudioRegenerateButton: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(spacing: 16) {
            Rectangle()
                .fill(Color.white.opacity(0.05))
                .frame(height: 1)

            Button {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    chatVM.regenerate()
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14, weight: .heavy))
                    Text("Regenerate with changes")
                        .font(.system(size: 15, weight: .heavy))
                }
                .foregroundColor(Color(hex: "0A0A0A"))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white)
                )
            }

            Button {
                chatVM.newConversation()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .bold))
                    Text("Start fresh")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(Color(hex: "6B6B6B"))
            }
        }
    }
}

// MARK: - Share sheet

private struct StudioShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
