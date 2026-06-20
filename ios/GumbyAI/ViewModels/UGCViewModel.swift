import SwiftUI
import UIKit

@MainActor
final class UGCViewModel: ObservableObject {
    // Catalog — the curated creators shown on the Creators screen
    // (`UGCView`), mirroring web's /templates `listTemplates(1)`.
    @Published var templates: [UGCTemplate] = []
    @Published var isLoadingTemplates = false
    @Published var templatesError: String?

    // Jobs — every UGC ad the user has generated, shown on History
    // (`UGCMyVideosView`), mirroring web's /history.
    @Published var jobs: [UGCJob] = []
    @Published var isLoadingJobs = false
    @Published var jobsError: String?

    /// Set by the sidebar when the user taps a recent video — UGCMyVideosView
    /// observes this and pops the matching player sheet on appear. Cleared
    /// after the sheet is presented so revisiting History doesn't re-open it.
    @Published var focusedJobId: String?

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

    // MARK: - Jobs

    func loadJobs() async {
        isLoadingJobs = true
        defer { isLoadingJobs = false }
        do {
            jobs = try await service.fetchJobs(page: 1)
            jobsError = nil
            // Warm the Recents thumbnails (sidebar caps at 12) so they appear
            // instantly instead of re-downloading on every sidebar open.
            let thumbURLs = jobs.prefix(12).compactMap { job in
                URL(string: job.outputThumbnailURL ?? job.templateSnapshot?.thumbnailURL ?? "")
            }
            ImagePrefetcher.shared.prefetch(urls: thumbURLs)
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
                continue
            }
        }
    }
}
