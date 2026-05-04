import Foundation

/// Persists assistant-generated image URLs per user for the Posts gallery.
@MainActor
final class GeneratedImagesStore: ObservableObject {
    static let shared = GeneratedImagesStore()

    struct Item: Codable, Equatable, Identifiable {
        var id: String { url }
        let url: String
        let createdAt: Date
    }

    @Published private(set) var items: [Item] = []

    private let defaults = UserDefaults.standard
    private let storageKeyPrefix = "gumby.generatedPostImages."

    private init() {
        load()
    }

    private var storageKey: String {
        let userId = AuthService.shared.getUserId() ?? "anonymous"
        return storageKeyPrefix + userId
    }

    func reloadForCurrentUser() {
        load()
    }

    private func load() {
        guard let data = defaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([Item].self, from: data) else {
            items = []
            return
        }
        items = decoded.sorted { $0.createdAt > $1.createdAt }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            defaults.set(data, forKey: storageKey)
        }
    }

    func recordAssistantImageURLs(_ urls: [String]?, createdAt: Date = Date()) {
        guard let urls, !urls.isEmpty else { return }
        mergeIn(urlDatePairs: urls.filter { !$0.isEmpty }.map { ($0, createdAt) })
    }

    func ingestMessages(_ messages: [Message]) {
        var pairs: [(String, Date)] = []
        for msg in messages where msg.role == .assistant {
            guard let urls = msg.imageURLs else { continue }
            let d = msg.createdAt ?? Date()
            for url in urls where !url.isEmpty {
                pairs.append((url, d))
            }
        }
        mergeIn(urlDatePairs: pairs)
    }

    private func mergeIn(urlDatePairs: [(String, Date)]) {
        guard !urlDatePairs.isEmpty else { return }

        var byURL: [String: Date] = Dictionary(uniqueKeysWithValues: items.map { ($0.url, $0.createdAt) })
        for (url, date) in urlDatePairs where !url.isEmpty {
            if let prev = byURL[url] {
                byURL[url] = max(prev, date)
            } else {
                byURL[url] = date
            }
        }
        items = byURL.map { Item(url: $0.key, createdAt: $0.value) }.sorted { $0.createdAt > $1.createdAt }
        save()
    }
}
