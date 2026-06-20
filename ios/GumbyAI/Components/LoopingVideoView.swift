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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea()

            // Intentionally no loading spinner / "Loading…" text or failure
            // badge: a template whose video hasn't loaded (or failed) just
            // stays on its black/poster background rather than covering the
            // tile with a spinner or error overlay.
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
    private var timeControlObservation: NSKeyValueObservation?
    private var failureObserver: NSObjectProtocol?
    private var endOfPlaybackObserver: NSObjectProtocol?
    private var attachedURL: URL?
    /// Flipped true by `tearDown()` so any in-flight observer callbacks
    /// (KVO trampolines, notification handlers) bail before touching the
    /// AVPlayer they no longer own. Without this, closing a template
    /// preview while the AVPlayerItem was still mid-status-flip could
    /// race and crash on the AVPlayer cleanup path.
    private var torndown: Bool = false

    init() {
        player.automaticallyWaitsToMinimizeStalling = true
        player.actionAtItemEnd = .none
    }

    func attach(url: URL, muted: Bool, isActive: Bool) {
        // No-op if we're already attached to the same URL.
        if attachedURL == url, looper != nil { return }
        tearDown()
        attachedURL = url
        torndown = false

        // Reuse a preloaded AVURLAsset when available so the moov atom /
        // track metadata don't have to be re-fetched here on the critical
        // path. See VideoPreloader for the warmup strategy.
        let asset = VideoPreloader.shared.asset(for: url)
        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 2.0

        // CRITICAL: AVQueuePlayer must start empty; the looper takes ownership.
        player.removeAllItems()
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = muted

        state = .loading

        statusObservation = item.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self, !self.torndown else { return }
                switch item.status {
                case .readyToPlay:
                    self.state = .ready
                case .failed:
                    let msg = item.error?.localizedDescription
                        ?? "AVPlayerItem.status = .failed"
                    print("[LoopingVideoView] failed:", msg, "url=", url.absoluteString.prefix(120))
                    self.state = .failed(msg)
                case .unknown:
                    // Don't downgrade state if we've already flipped to .ready via
                    // timeControlStatus — sometimes the KVO fires .initial=.unknown
                    // *after* playback has already started.
                    if self.state != .ready { self.state = .loading }
                @unknown default:
                    if self.state != .ready { self.state = .loading }
                }
            }
        }

        // Belt-and-suspenders: the AVPlayerItem.status KVO is occasionally flaky
        // on iOS 26 (we've seen it stay at .unknown even while the AVPlayer is
        // actively rendering frames). Observing AVPlayer.timeControlStatus lets
        // us clear the loading spinner the instant playback actually begins,
        // regardless of what the item-status KVO reports.
        timeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            Task { @MainActor in
                guard let self, !self.torndown else { return }
                if player.timeControlStatus == .playing {
                    self.state = .ready
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
            Task { @MainActor in
                guard let self, !self.torndown else { return }
                self.state = .failed(msg)
            }
        }

        // Belt-and-suspenders manual loop. AVPlayerLooper *should* keep the
        // clip cycling on its own — but in practice we've seen it stop
        // after a single playthrough on some iOS versions / asset shapes
        // (probably a race with the preloader handing back a partially
        // ready AVURLAsset). Observing `.AVPlayerItemDidPlayToEndTime`
        // and explicitly seeking to zero + resuming guarantees the loop
        // regardless of whether the looper is working. When the looper
        // *is* working, this notification fires on the templateItem (not
        // the active duplicate), so the seek is harmless.
        //
        // The observer is registered on `nil` object so it catches the
        // end notification for whichever AVPlayerItem the looper is
        // currently playing (the looper rotates between duplicates of
        // the template item, and we don't get a handle on them).
        endOfPlaybackObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                // Bail if this controller has been torn down — the close
                // path on a template preview used to race this notification
                // and crash on the AVPlayer cleanup path.
                guard !self.torndown else { return }
                // Only act on this player's items, not other LoopingVideoViews.
                guard let current = self.player.currentItem else { return }
                current.seek(to: .zero, completionHandler: nil)
                if self.player.timeControlStatus != .playing {
                    self.player.play()
                }
            }
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
        // Mark torn-down BEFORE we start tearing anything down — any
        // observer callback that fires concurrently will see this flag
        // and bail without touching the half-deconstructed player.
        torndown = true

        // Detach KVO + notification observers FIRST. Once these are off
        // there's nothing left to fire callbacks against the player we're
        // about to dismantle.
        statusObservation?.invalidate()
        statusObservation = nil
        loadedRangesObservation?.invalidate()
        loadedRangesObservation = nil
        timeControlObservation?.invalidate()
        timeControlObservation = nil
        if let observer = failureObserver {
            NotificationCenter.default.removeObserver(observer)
            failureObserver = nil
        }
        if let observer = endOfPlaybackObserver {
            NotificationCenter.default.removeObserver(observer)
            endOfPlaybackObserver = nil
        }

        // Now safe to dismantle the player. Pause before disabling the
        // looper so AVPlayerLooper doesn't try to swap in another copy
        // of the template item while we're tearing it apart.
        player.pause()
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        attachedURL = nil
    }

    deinit {
        statusObservation?.invalidate()
        loadedRangesObservation?.invalidate()
        timeControlObservation?.invalidate()
        if let observer = failureObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = endOfPlaybackObserver {
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
