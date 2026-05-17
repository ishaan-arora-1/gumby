import SwiftUI
import AVFoundation
import AVKit
import Combine

/// Robust looping video player with visible loading/error states.
///
/// Implementation notes (these were footguns we hit before):
///
/// 1. AVPlayerLooper REQUIRES an empty queue; you must NOT pass the template
///    item to the AVQueuePlayer initializer (Apple's docs say so explicitly —
///    the looper replicates the item itself). Doing both leaves the queue in
///    a broken state where playback silently never starts.
///
/// 2. SwiftUI's UIViewRepresentable reuses the same view when only `url`
///    changes — `updateUIView` MUST tear the old player down and rebuild
///    with the new URL, or you get the previous video stuck on screen.
///
/// 3. We surface .ready / .failed / .loading state so a black screen never
///    looks "the same" as a failed download.
struct LoopingVideoView: View {
    let url: URL
    var isActive: Bool = true
    var muted: Bool = true
    var aspectFill: Bool = true

    @StateObject private var controller = PlayerController()

    var body: some View {
        ZStack {
            Color.black

            PlayerLayerView(controller: controller, aspectFill: aspectFill)
                .ignoresSafeArea()

            switch controller.state {
            case .loading:
                VStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text("Loading…")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.85))
                }
                .padding(10)
                .background(.ultraThinMaterial.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            case .failed(let message):
                VStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.orange)
                    Text("Video failed")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                    Text(message)
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 12)
                        .lineLimit(3)
                }
                .padding(14)
                .background(.ultraThinMaterial.opacity(0.7))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            case .ready:
                EmptyView()
            }
        }
        .onAppear {
            controller.attach(url: url, muted: muted, isActive: isActive)
        }
        .onChange(of: url) { _, newURL in
            controller.attach(url: newURL, muted: muted, isActive: isActive)
        }
        .onChange(of: muted) { _, newMuted in
            controller.setMuted(newMuted)
        }
        .onChange(of: isActive) { _, active in
            controller.setActive(active)
        }
        .onDisappear {
            controller.tearDown()
        }
    }
}

// MARK: - Controller

@MainActor
final class PlayerController: ObservableObject {
    enum State: Equatable {
        case loading
        case ready
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    fileprivate let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var statusObservation: NSKeyValueObservation?
    private var loadedRangesObservation: NSKeyValueObservation?
    private var failureObserver: NSObjectProtocol?
    private var attachedURL: URL?

    init() {
        player.automaticallyWaitsToMinimizeStalling = true
        player.actionAtItemEnd = .none
    }

    func attach(url: URL, muted: Bool, isActive: Bool) {
        // No-op if we're already attached to the same URL.
        if attachedURL == url, looper != nil { return }
        tearDown()
        attachedURL = url

        let asset = AVURLAsset(url: url)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 2.0

        // CRITICAL: AVQueuePlayer must start empty; the looper takes ownership.
        player.removeAllItems()
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = muted

        state = .loading

        statusObservation = item.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self else { return }
                switch item.status {
                case .readyToPlay:
                    self.state = .ready
                case .failed:
                    let msg = item.error?.localizedDescription
                        ?? "AVPlayerItem.status = .failed"
                    print("[LoopingVideoView] failed:", msg, "url=", url.absoluteString.prefix(120))
                    self.state = .failed(msg)
                case .unknown:
                    self.state = .loading
                @unknown default:
                    self.state = .loading
                }
            }
        }

        failureObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] note in
            let err = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
            let msg = err?.localizedDescription ?? "Failed to play to end"
            print("[LoopingVideoView] FailedToPlayToEnd:", msg)
            Task { @MainActor in self?.state = .failed(msg) }
        }

        if isActive {
            player.play()
        }
    }

    func setMuted(_ muted: Bool) { player.isMuted = muted }

    func setActive(_ active: Bool) {
        if active { player.play() } else { player.pause() }
    }

    func tearDown() {
        statusObservation?.invalidate()
        statusObservation = nil
        loadedRangesObservation?.invalidate()
        loadedRangesObservation = nil
        if let observer = failureObserver {
            NotificationCenter.default.removeObserver(observer)
            failureObserver = nil
        }
        player.pause()
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        attachedURL = nil
    }

    deinit {
        statusObservation?.invalidate()
        loadedRangesObservation?.invalidate()
        if let observer = failureObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}

// MARK: - UIView host for AVPlayerLayer

private struct PlayerLayerView: UIViewRepresentable {
    let controller: PlayerController
    let aspectFill: Bool

    func makeUIView(context: Context) -> Container {
        let v = Container()
        v.playerLayer.player = controller.player
        v.playerLayer.videoGravity = aspectFill ? .resizeAspectFill : .resizeAspect
        v.backgroundColor = .black
        return v
    }

    func updateUIView(_ uiView: Container, context: Context) {
        if uiView.playerLayer.player !== controller.player {
            uiView.playerLayer.player = controller.player
        }
        uiView.playerLayer.videoGravity = aspectFill ? .resizeAspectFill : .resizeAspect
    }

    final class Container: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
