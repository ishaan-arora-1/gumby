import SwiftUI
import UIKit

/// In-memory thumbnail cache + prefetcher — the image counterpart to
/// `VideoPreloader`.
///
/// SwiftUI's `AsyncImage` keeps no persistent cache, so any list that gets
/// rebuilt (e.g. the sidebar Recents, which refetches jobs every time it
/// opens) re-downloads every thumbnail from scratch and shows the user a
/// multi-second load each time. Warming the thumbnails here when the jobs
/// arrive — and reading from this cache synchronously on first frame — makes
/// them appear instantly on every subsequent open.
final class ImagePrefetcher: @unchecked Sendable {
    static let shared = ImagePrefetcher()

    private let cache = NSCache<NSURL, UIImage>()
    private let lock = NSLock()
    private var inflight: Set<URL> = []

    private init() {
        // Recents caps at 12; allow plenty of headroom for grids/feeds too.
        cache.countLimit = 256
    }

    /// Thread-safe synchronous peek (NSCache is thread-safe). Lets a view
    /// render a cached thumbnail on its very first frame with no placeholder
    /// flash.
    func cachedImage(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    /// Returns a cached image, or downloads + caches it.
    func image(for url: URL) async -> UIImage? {
        if let img = cachedImage(for: url) { return img }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let img = UIImage(data: data) else { return nil }
        cache.setObject(img, forKey: url as NSURL)
        return img
    }

    /// Warm the leading `limit` thumbnails so they're instant when shown.
    /// Idempotent — already-cached or in-flight URLs are skipped.
    func prefetch(urls: [URL], limit: Int = 12) {
        for url in urls.prefix(limit) {
            if cachedImage(for: url) != nil { continue }
            lock.lock()
            let alreadyInflight = inflight.contains(url)
            if !alreadyInflight { inflight.insert(url) }
            lock.unlock()
            if alreadyInflight { continue }
            Task {
                _ = await self.image(for: url)
                self.lock.lock()
                self.inflight.remove(url)
                self.lock.unlock()
            }
        }
    }
}

/// Drop-in replacement for `AsyncImage` that reads `ImagePrefetcher`'s cache.
/// Exposes the same `(AsyncImagePhase) -> Content` closure as `AsyncImage`, so
/// existing call sites switch over with no other changes. When the image is
/// already cached it renders `.success` on the first frame (no spinner / flash).
struct CachedAsyncImage<Content: View>: View {
    private let url: URL?
    @ViewBuilder private let content: (AsyncImagePhase) -> Content
    @State private var phase: AsyncImagePhase

    init(url: URL?, @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url
        self.content = content
        if let url, let img = ImagePrefetcher.shared.cachedImage(for: url) {
            _phase = State(initialValue: .success(Image(uiImage: img)))
        } else {
            _phase = State(initialValue: .empty)
        }
    }

    var body: some View {
        content(phase)
            .task(id: url) {
                guard let url else { phase = .empty; return }
                // Already resolved from cache in init — nothing to fetch.
                if case .success = phase { return }
                if let img = await ImagePrefetcher.shared.image(for: url) {
                    phase = .success(Image(uiImage: img))
                } else {
                    phase = .empty
                }
            }
    }
}
