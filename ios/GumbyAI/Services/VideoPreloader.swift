import Foundation
import AVFoundation

/// Warms `AVURLAsset` metadata for video URLs *before* a player is attached.
///
/// The first time `LoopingVideoView` plays a remote MP4 it pays for the moov
/// atom + initial buffer fetch, which is what shows up to the user as the
/// "Loading…" spinner. By pre-fetching the asset's `tracks` / `duration` /
/// `isPlayable` keys ahead of time we move that latency off the critical
/// path — by the time the user scrolls onto the card the asset is already
/// parsed, and AVPlayerItem flips to `.readyToPlay` almost immediately.
///
/// Concurrency is bounded so a 30-item feed doesn't fan out 30 simultaneous
/// fetches that starve the videos currently on screen (we hit exactly this
/// regression on cold-start before adding `maxConcurrent`). Items beyond the
/// initial preload window warm lazily when `asset(for:)` cache-misses them.
@MainActor
final class VideoPreloader {
    static let shared = VideoPreloader()

    private var cache: [URL: AVURLAsset] = [:]
    private var inflight: Set<URL> = []
    private var pending: [URL] = []
    /// Soft cap — avoid holding hundreds of assets in memory on big feeds.
    private let maxEntries = 60
    /// Cap how many moov fetches run in parallel so they don't starve the
    /// AVPlayers actually on screen.
    private let maxConcurrent = 2
    /// How many leading items to warm when a list arrives. The rest are
    /// warmed on-demand when the player asks for them.
    static let defaultPrefetchWindow = 6

    private init() {}

    /// Returns the cached asset for `url`, creating (and caching) one if
    /// needed. Used by `LoopingVideoView` so a preloaded asset is reused.
    ///
    /// A cache miss here means the player got to this URL before the explicit
    /// preload pass did. We still queue a warmup so the asset reference the
    /// player is about to use is the same one being warmed.
    func asset(for url: URL) -> AVURLAsset {
        if let existing = cache[url] { return existing }
        let asset = AVURLAsset(url: url)
        insert(asset, for: url)
        enqueue(url: url)
        return asset
    }

    /// Queues background metadata loads for the leading `limit` URLs.
    /// Idempotent — already-cached or in-flight URLs are skipped. Defaults
    /// to a small window so we don't saturate the network on big feeds.
    func preload(urls: [URL], limit: Int = defaultPrefetchWindow) {
        for url in urls.prefix(limit) {
            if cache[url] == nil {
                let asset = AVURLAsset(url: url)
                insert(asset, for: url)
            }
            enqueue(url: url)
        }
    }

    /// Convenience for callers that have URL strings (templates/library API).
    func preload(urlStrings: [String?], limit: Int = defaultPrefetchWindow) {
        let urls = urlStrings.compactMap { $0.flatMap(URL.init(string:)) }
        preload(urls: urls, limit: limit)
    }

    private func enqueue(url: URL) {
        guard !inflight.contains(url) else { return }
        if pending.contains(url) { return }
        pending.append(url)
        pump()
    }

    private func pump() {
        while inflight.count < maxConcurrent, !pending.isEmpty {
            let url = pending.removeFirst()
            guard let asset = cache[url] else { continue }
            inflight.insert(url)
            Task.detached(priority: .utility) {
                _ = try? await asset.load(.tracks, .duration, .isPlayable)
                await MainActor.run {
                    self.inflight.remove(url)
                    self.pump()
                }
            }
        }
    }

    private func insert(_ asset: AVURLAsset, for url: URL) {
        if cache.count >= maxEntries, let firstKey = cache.keys.first {
            cache.removeValue(forKey: firstKey)
        }
        cache[url] = asset
    }
}
