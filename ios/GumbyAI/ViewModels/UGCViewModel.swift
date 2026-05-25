import SwiftUI
import UIKit

@MainActor
final class UGCViewModel: ObservableObject {
    /// The Models screen has three sections:
    ///   • Explore  — the curated 6 templates
    ///   • Library  — every creator the user has personally generated
    ///   • My Videos — completed final UGC ads
    /// Library lets users reuse a previously generated creator without
    /// regenerating one — tap "Use" and you land straight on product entry.
    enum Tab: String, CaseIterable, Hashable {
        case explore = "Explore"
        case library = "Library"
        case myVideos = "My Videos"

        var iconName: String {
            switch self {
            case .explore: "person.crop.rectangle.stack"
            case .library: "sparkles"
            case .myVideos: "play.rectangle.fill"
            }
        }
    }

    /// Explore + Library tabs can show the TikTok-style feed or Pinterest grid.
    enum FeedLayout: Hashable {
        case feed
        case grid
    }

    // Catalog
    @Published var templates: [UGCTemplate] = []
    @Published var isLoadingTemplates = false
    @Published var templatesError: String?

    // Library
    @Published var library: [UGCCreatorJob] = []
    @Published var isLoadingLibrary = false
    @Published var libraryError: String?

    // Jobs
    @Published var jobs: [UGCJob] = []
    @Published var isLoadingJobs = false
    @Published var jobsError: String?

    // UI
    @Published var selectedTab: Tab = .explore
    @Published var feedLayout: FeedLayout = .feed
    @Published var feedIndex: Int = 0
    @Published var lastJustCreatedJob: UGCJob?

    private let service = UGCService.shared
    private var pollTask: Task<Void, Never>?

    // MARK: - Templates

    func loadTemplates(force: Bool = false) async {
        if !force, !templates.isEmpty { return }
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            templates = try await service.fetchTemplates(page: 1)
            VideoPreloader.shared.preload(urlStrings: templates.map { $0.videoURL })
            templatesError = nil
        } catch {
            templatesError = error.localizedDescription
        }
    }

    // MARK: - Library

    func loadLibrary(force: Bool = false) async {
        if !force, !library.isEmpty { return }
        isLoadingLibrary = true
        defer { isLoadingLibrary = false }
        do {
            library = try await service.fetchLibrary()
            VideoPreloader.shared.preload(urlStrings: library.map { $0.videoURL })
            libraryError = nil
        } catch {
            libraryError = error.localizedDescription
        }
    }

    // MARK: - Jobs

    func loadJobs() async {
        isLoadingJobs = true
        defer { isLoadingJobs = false }
        do {
            jobs = try await service.fetchJobs(page: 1)
            jobsError = nil
            startPollingIfNeeded()
        } catch {
            jobsError = error.localizedDescription
        }
    }

    func deleteJob(_ job: UGCJob) async {
        do {
            try await service.deleteJob(id: job.id)
            jobs.removeAll { $0.id == job.id }
        } catch {
            jobsError = error.localizedDescription
        }
    }

    /// Submits a new generation job and switches to the My Videos tab.
    func submitGeneration(
        template: UGCTemplate,
        productName: String,
        productDescription: String,
        productImage: UIImage?,
        script: String
    ) async throws -> UGCJob {
        var imageURL: String? = nil
        if let img = productImage {
            imageURL = try await service.uploadProductImage(img)
        }
        let job = try await service.startGeneration(
            UGCService.GenerateRequest(
                templateId: template.id,
                creatorDescription: nil,
                productName: productName,
                productDescription: productDescription,
                productImageURL: imageURL,
                inspirationImageURL: nil,
                script: script,
                videoDescription: "",
                videoDuration: 10
            )
        )
        // Optimistic insert; real status will get reconciled by polling.
        jobs.insert(job, at: 0)
        lastJustCreatedJob = job
        selectedTab = .myVideos
        startPollingIfNeeded()
        return job
    }

    // MARK: - Polling

    func startPollingIfNeeded() {
        let hasInFlight = jobs.contains(where: { !$0.status.isTerminal })
        if hasInFlight, pollTask == nil {
            pollTask = Task { [weak self] in
                guard let self else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    if Task.isCancelled { break }
                    await self.refreshInFlightJobs()
                    let stillInFlight = await MainActor.run {
                        self.jobs.contains(where: { !$0.status.isTerminal })
                    }
                    if !stillInFlight { break }
                }
                await MainActor.run { self.pollTask = nil }
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func refreshInFlightJobs() async {
        let inFlightIds = jobs.filter { !$0.status.isTerminal }.map(\.id)
        for id in inFlightIds {
            do {
                let updated = try await service.fetchJob(id: id)
                if let idx = jobs.firstIndex(where: { $0.id == id }) {
                    jobs[idx] = updated
                }
            } catch {
                // single failure shouldn't kill polling
                continue
            }
        }
    }
}
