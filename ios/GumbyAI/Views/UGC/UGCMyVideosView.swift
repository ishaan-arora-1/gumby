import SwiftUI
import AVKit
import Photos

struct UGCMyVideosView: View {
    @EnvironmentObject var ugcVM: UGCViewModel
    @State private var openJob: UGCJob?

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
                                if job.status == .completed { openJob = job }
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
            UGCVideoPlayerSheet(job: job)
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
            Text("Tap a template, drop in your product, hit generate. We'll do the rest.")
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
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Color.black
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
            Text(job.productName.isEmpty ? (job.templateSnapshot?.name ?? "Video") : job.productName)
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
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

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

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Color.clear.frame(height: 56) // headroom for the floating top bar

                    // Title
                    VStack(alignment: .leading, spacing: 4) {
                        Text(job.productName.isEmpty ? "Untitled ad" : job.productName)
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

            // Floating top bar with close + actions
            topBar
                .padding(.horizontal, 12)
                .padding(.top, 8)
        }
        .preferredColorScheme(.dark)
        .onAppear {
            if let url = job.outputVideoURL.flatMap(URL.init(string:)) {
                player = AVPlayer(url: url)
                player?.isMuted = false
                player?.play()
            }
        }
        .onDisappear { player?.pause() }
        .sheet(isPresented: $showShare) {
            if let url = job.outputVideoURL.flatMap(URL.init(string:)) {
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

    private var subtitleLine: String {
        var parts: [String] = []
        if let d = job.videoDuration { parts.append("\(d)s") }
        parts.append(isTemplate ? "Template mode" : "Direct prompt")
        return parts.joined(separator: " · ")
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
            } else if job.status == .completed {
                ProgressView().tint(.white)
            } else {
                VStack(spacing: 10) {
                    ProgressView().tint(.white)
                    Text(job.status == .failed ? (job.error ?? "Failed") : "Still rendering…")
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
            if let url = job.outputVideoURL, !url.isEmpty {
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
        guard let urlString = job.outputVideoURL,
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
