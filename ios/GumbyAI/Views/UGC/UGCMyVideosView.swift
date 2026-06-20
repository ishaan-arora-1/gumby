import SwiftUI
import AVKit
import Photos

struct UGCMyVideosView: View {
    @EnvironmentObject var ugcVM: UGCViewModel
    @State private var openJob: UGCJob?

    /// Bubbled up from `UGCVideoPlayerSheet`'s "Use creator" button.
    /// The History destination wires this to picking the new template on
    /// `ChatViewModel` and navigating to `.chat` — mirrors web's
    /// /history/[id] → /studio hand-off.
    var onUseTemplate: ((UGCTemplate) -> Void)? = nil

    private var gridColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: 8),
            GridItem(.flexible(), spacing: 8),
        ]
    }

    var body: some View {
        Group {
            if ugcVM.isLoadingJobs && ugcVM.jobs.isEmpty {
                ProgressView().tint(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if ugcVM.jobs.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVGrid(columns: gridColumns, spacing: 8) {
                        ForEach(ugcVM.jobs) { job in
                            UGCJobCard(job: job, onTap: {
                                // Open for any status — the sheet shows the
                                // generating screen for in-flight jobs and the
                                // detail view once finished.
                                openJob = job
                            })
                            .contextMenu {
                                Button(role: .destructive) {
                                    Task { await ugcVM.deleteJob(job) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                }
                .refreshable { await ugcVM.loadJobs() }
            }
        }
        .sheet(item: $openJob) { job in
            UGCVideoPlayerSheet(
                job: job,
                onUseTemplate: onUseTemplate.map { handler in
                    { tpl in
                        // Close the sheet before bubbling the template up
                        // so the navigation into Studio doesn't fight
                        // with the sheet dismissal animation.
                        openJob = nil
                        handler(tpl)
                    }
                }
            )
        }
        // Deep-link from the sidebar's Recents list. When the user taps a
        // recent video, the sidebar sets `focusedJobId` on the shared VM,
        // navigates to .history, and we pop the matching detail sheet. We
        // clear the focused id afterwards so re-entering History doesn't
        // auto-open it again.
        .onAppear { presentFocusedIfAny() }
        .onChange(of: ugcVM.focusedJobId) { _, _ in presentFocusedIfAny() }
    }

    private func presentFocusedIfAny() {
        guard let id = ugcVM.focusedJobId else { return }
        if let job = ugcVM.jobs.first(where: { $0.id == id }) {
            openJob = job
            ugcVM.focusedJobId = nil
        } else {
            // Job not in the cached list yet (e.g. brand-new generation
            // before /jobs has refreshed). Fetch the row, then present.
            Task {
                do {
                    let fetched = try await UGCService.shared.fetchJob(id: id)
                    await MainActor.run {
                        openJob = fetched
                        ugcVM.focusedJobId = nil
                    }
                } catch {
                    await MainActor.run { ugcVM.focusedJobId = nil }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "wand.and.stars.inverse")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("No videos yet")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
            Text("Head to the studio and generate your first ad. Everything you make will appear here.")
                .font(.system(size: 14))
                .foregroundColor(AppConstants.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }
}

// MARK: - Job card

struct UGCJobCard: View {
    let job: UGCJob
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack {
                background

                // Status overlays
                if job.status != .completed {
                    overlay
                }

                // Bottom title bar
                VStack {
                    Spacer()
                    HStack(alignment: .center, spacing: 6) {
                        statusChip
                        Spacer()
                    }
                    .padding(8)
                    .background(
                        LinearGradient(
                            colors: [.clear, Color.black.opacity(0.7)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                }
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var background: some View {
        if let urlString = job.outputThumbnailURL ?? job.templateSnapshot?.thumbnailURL,
           let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .empty:
                    // Thumbnail still downloading — show a spinner over a
                    // dark slab instead of an opaque black square so the
                    // tile reads as "loading", not "broken".
                    ZStack {
                        LinearGradient(
                            colors: [Color(red: 0.10, green: 0.10, blue: 0.13), .black],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                        ProgressView()
                            .tint(.white.opacity(0.85))
                            .scaleEffect(0.9)
                    }
                case .failure:
                    // Thumbnail download failed — still better to fall back
                    // to the gradient than to expose the error.
                    LinearGradient(
                        colors: [Color(red: 0.12, green: 0.12, blue: 0.16), .black],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                @unknown default:
                    Color.black
                }
            }
        } else {
            LinearGradient(
                colors: [Color(red: 0.12, green: 0.12, blue: 0.16), .black],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }

    private var overlay: some View {
        ZStack {
            Color.black.opacity(0.45)
            VStack(spacing: 10) {
                if job.status == .failed {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 26))
                        .foregroundColor(.orange)
                } else {
                    ProgressView().tint(.white)
                }
                Text(job.status.displayLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                if job.status != .failed {
                    Text("\(job.progress)%")
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
        }
    }

    private var statusChip: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(chipColor)
                .frame(width: 6, height: 6)
            Text(job.displayTitle)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(.ultraThinMaterial))
    }

    private var chipColor: Color {
        switch job.status {
        case .completed: return .green
        case .failed: return .red
        default: return .yellow
        }
    }
}

// MARK: - History detail sheet
//
// Mirrors the web /history/[id] page: video on top in a 9:16 card,
// scrollable list of brief sections below (Creator/Template, Ethnicity,
// Product, Script, Scene, Captions). Save / Share live in the header.

struct UGCVideoPlayerSheet: View {
    let job: UGCJob
    /// Optional hook the parent uses to wire "Use creator" through to
    /// `chatVM.pickTemplate(_:)` and a navigation jump back to Studio.
    var onUseTemplate: ((UGCTemplate) -> Void)? = nil

    /// Live copy of the job. Seeded from `job`, then refreshed by polling so
    /// that a still-rendering job opened from History/Recents shows the
    /// generating screen and flips to the finished detail view in place.
    @State private var liveJob: UGCJob

    init(job: UGCJob, onUseTemplate: ((UGCTemplate) -> Void)? = nil) {
        self.job = job
        self.onUseTemplate = onUseTemplate
        self._liveJob = State(initialValue: job)
    }

    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false
    @State private var reusing = false
    @State private var reuseError: String?

    private var isTemplate: Bool { (job.templateId ?? "").isEmpty == false }
    private var snapshot: UGCJob.TemplateSnapshot? { job.templateSnapshot }
    private var creatorLabel: String {
        if isTemplate {
            return snapshot?.actorName ?? snapshot?.name ?? "Template creator"
        }
        return snapshot?.actorName ?? "Creator"
    }
    private var captionsEnabled: Bool { snapshot?.captionsEnabled ?? true }
    private var captionLabel: String {
        guard captionsEnabled else { return "Off" }
        let id = snapshot?.captionPreset ?? CaptionPreset.defaultId
        return "On · \(CaptionPreset.get(id).label)"
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color(red: 0.04, green: 0.04, blue: 0.05).ignoresSafeArea()

            if liveJob.status.isTerminal {
                detailContent
            } else {
                // In-flight job reopened from History/Recents — show the same
                // progress screen the user saw in the Studio when they tapped
                // Generate, not the default detail / "Still rendering…" view.
                ScrollView {
                    VStack(spacing: 0) {
                        Color.clear.frame(height: 56)
                        GeneratingProgressView(status: liveJob.status, progress: liveJob.progress)
                    }
                }
            }

            // Floating top bar with close + actions
            topBar
                .padding(.horizontal, 12)
                .padding(.top, 8)
        }
        .preferredColorScheme(.dark)
        .task { await pollUntilTerminal() }
        .onAppear { setupPlayerIfReady() }
        .onChange(of: liveJob.outputVideoURL) { _, _ in setupPlayerIfReady() }
        .onDisappear { player?.pause() }
        .sheet(isPresented: $showShare) {
            if let url = liveJob.outputVideoURL.flatMap(URL.init(string:)) {
                ShareSheet(items: [url])
            }
        }
        .alert("Saved", isPresented: Binding(
            get: { saveMessage != nil },
            set: { if !$0 { saveMessage = nil } }
        )) {
            Button("OK", role: .cancel) { saveMessage = nil }
        } message: {
            Text(saveMessage ?? "")
        }
    }

    /// Polls the job every 3s while it's still rendering, swapping in the
    /// fresh row so the screen transitions from generating → finished in place.
    private func pollUntilTerminal() async {
        while !Task.isCancelled, !liveJob.status.isTerminal {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if Task.isCancelled { break }
            if let fresh = try? await UGCService.shared.fetchJob(id: job.id) {
                liveJob = fresh
            }
        }
    }

    private func setupPlayerIfReady() {
        guard player == nil,
              let url = liveJob.outputVideoURL.flatMap(URL.init(string:)) else { return }
        let p = AVPlayer(url: url)
        p.isMuted = false
        p.play()
        player = p
    }

    private var detailContent: some View {
        ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Color.clear.frame(height: 56) // headroom for the floating top bar

                    // Title
                    VStack(alignment: .leading, spacing: 4) {
                        Text(liveJob.displayTitle)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                        Text(subtitleLine)
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .padding(.horizontal, 20)

                    // Video — 9:16 card
                    videoCard
                        .padding(.horizontal, 20)

                    // Use-creator CTA — only available once the video is
                    // ready AND the parent wired up the callback (i.e.
                    // when shown from the History destination, not from
                    // some hypothetical preview elsewhere).
                    if onUseTemplate != nil,
                       liveJob.status == .completed,
                       (liveJob.outputVideoURL ?? "").isEmpty == false {
                        useCreatorButton
                            .padding(.horizontal, 20)
                    }

                    // Brief
                    VStack(alignment: .leading, spacing: 10) {
                        Text("THE BRIEF")
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(0.8)
                            .foregroundColor(.white.opacity(0.4))
                            .padding(.bottom, 2)

                        briefRow(label: isTemplate ? "Template" : "Creator", value: creatorLabel)
                        if !isTemplate, let eth = snapshot?.userEthnicity, !eth.isEmpty {
                            briefRow(label: "Ethnicity", value: eth)
                        }
                        if isTemplate, let tweaks = snapshot?.userTweaks, !tweaks.isEmpty {
                            briefRow(label: "Creator tweaks", value: tweaks, multiline: true)
                        }
                        if !job.productName.isEmpty {
                            briefRow(label: "Product", value: job.productName)
                        }
                        if !job.productDescription.isEmpty {
                            briefRow(label: "Product details", value: job.productDescription, multiline: true)
                        }
                        if let imgURL = job.productImageURL, !imgURL.isEmpty {
                            briefImageRow(label: "Product image", urlString: imgURL)
                        }
                        if !job.script.isEmpty {
                            briefRow(label: "Script", value: job.script, multiline: true)
                        }
                        if let desc = job.videoDescription, !desc.isEmpty {
                            briefRow(label: "Scene", value: desc, multiline: true)
                        }
                        briefRow(label: "Captions", value: captionLabel)
                    }
                    .padding(.horizontal, 20)

                    Color.clear.frame(height: 24)
                }
            }
        }

    private var subtitleLine: String {
        var parts: [String] = []
        if let d = job.videoDuration { parts.append("\(d)s") }
        parts.append(isTemplate ? "Template mode" : "Direct prompt")
        return parts.joined(separator: " · ")
    }

    // MARK: - Use creator (history → reusable template)
    //
    // Tap → backend mints a hidden ugc_templates row from this job's
    // output video → we bubble that template up to the parent which
    // picks it on ChatViewModel and switches the destination to
    // .chat. Identical UX to web's /history/[id] "Use creator" button.

    private var useCreatorButton: some View {
        Button {
            Task { await useCreator() }
        } label: {
            HStack(spacing: 8) {
                if reusing {
                    ProgressView().tint(.white).scaleEffect(0.85)
                    Text("Loading…")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.white)
                    Text("Use this creator")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                LinearGradient(
                    colors: [Color(red: 1.0, green: 0.18, blue: 0.25),
                             Color(red: 0.88, green: 0.11, blue: 0.17)],
                    startPoint: .leading, endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: Color.black.opacity(0.35), radius: 16, y: 6)
        }
        .buttonStyle(.plain)
        .disabled(reusing)
        .overlay(alignment: .bottom) {
            if let reuseError {
                Text(reuseError)
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 1.0, green: 0.27, blue: 0.23))
                    .padding(.top, 56)
            }
        }
    }

    private func useCreator() async {
        guard let handler = onUseTemplate else { return }
        reusing = true
        reuseError = nil
        do {
            let tpl = try await UGCService.shared.useHistoryItem(jobId: job.id)
            await MainActor.run {
                reusing = false
                // Parent's handler closes the sheet AND drives navigation
                // into the Studio. We don't call dismiss() here ourselves.
                handler(tpl)
            }
        } catch {
            await MainActor.run {
                reusing = false
                reuseError = error.localizedDescription
            }
        }
    }

    private var videoCard: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.black)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )

            if let player {
                VideoPlayer(player: player)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else if liveJob.status == .completed {
                ProgressView().tint(.white)
            } else {
                VStack(spacing: 10) {
                    if liveJob.status == .failed {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.orange)
                    } else {
                        ProgressView().tint(.white)
                    }
                    Text(liveJob.status == .failed ? (liveJob.error ?? "Failed") : "Still rendering…")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
        }
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .frame(maxWidth: 320)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var topBar: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.ultraThinMaterial))
            }
            Spacer()
            if let url = liveJob.outputVideoURL, !url.isEmpty {
                Button { showShare = true } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.ultraThinMaterial))
                }
                Button { Task { await saveToPhotos() } } label: {
                    Group {
                        if saving {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "square.and.arrow.down")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(.ultraThinMaterial))
                }
                .disabled(saving)
            }
        }
    }

    // MARK: - Brief rows

    private func briefRow(label: String, value: String, multiline: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(.white.opacity(0.4))
            Text(value)
                .font(.system(size: 14))
                .foregroundColor(.white.opacity(0.88))
                .lineLimit(multiline ? nil : 2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func briefImageRow(label: String, urlString: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(.white.opacity(0.4))
            if let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    default:
                        Color.white.opacity(0.05)
                    }
                }
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private func saveToPhotos() async {
        guard let urlString = liveJob.outputVideoURL,
              let url = URL(string: urlString) else { return }
        saving = true
        defer { saving = false }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(job.id).mp4")
            try data.write(to: tmp)
            try await PhotoSaver.saveVideo(at: tmp)
            saveMessage = "Saved to Photos"
        } catch {
            saveMessage = "Save failed: \(error.localizedDescription)"
        }
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private enum PhotoSaver {
    static func saveVideo(at url: URL) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw NSError(domain: "PhotoSaver", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Photos access denied"
            ])
        }
        try await PHPhotoLibrary.shared().performChanges {
            let req = PHAssetCreationRequest.forAsset()
            req.addResource(with: .video, fileURL: url, options: nil)
        }
    }
}
