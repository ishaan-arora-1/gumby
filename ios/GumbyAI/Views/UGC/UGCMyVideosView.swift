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

// MARK: - Video player sheet

struct UGCVideoPlayerSheet: View {
    let job: UGCJob
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
                    .onAppear { player.play() }
                    .onDisappear { player.pause() }
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    Spacer()
                    if let url = job.outputVideoURL, !url.isEmpty {
                        Button { showShare = true } label: {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 36, height: 36)
                                .background(Circle().fill(.ultraThinMaterial))
                        }
                        Button { Task { await saveToPhotos() } } label: {
                            if saving {
                                ProgressView().tint(.white).frame(width: 36, height: 36)
                            } else {
                                Image(systemName: "square.and.arrow.down")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                                    .frame(width: 36, height: 36)
                                    .background(Circle().fill(.ultraThinMaterial))
                            }
                        }
                        .disabled(saving)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                Spacer()
                if !job.script.isEmpty {
                    Text(job.script)
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.95))
                        .padding(12)
                        .background(.ultraThinMaterial.opacity(0.85))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(16)
                        .lineLimit(4)
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            if let url = job.outputVideoURL.flatMap(URL.init(string:)) {
                player = AVPlayer(url: url)
            }
        }
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
