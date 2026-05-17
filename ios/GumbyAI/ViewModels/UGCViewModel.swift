import SwiftUI
import UIKit

@MainActor
final class UGCViewModel: ObservableObject {
    enum Tab: String, CaseIterable, Hashable {
        case templates = "Templates"
        case myVideos = "My Videos"
    }

    // Catalog
    @Published var templates: [UGCTemplate] = []
    @Published var voices: [UGCVoicePreset] = []
    @Published var isLoadingTemplates = false
    @Published var templatesError: String?

    // Jobs
    @Published var jobs: [UGCJob] = []
    @Published var isLoadingJobs = false
    @Published var jobsError: String?

    // UI
    @Published var selectedTab: Tab = .templates
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
            templatesError = nil
        } catch {
            templatesError = error.localizedDescription
        }
    }

    func loadVoices() async {
        guard voices.isEmpty else { return }
        do {
            voices = try await service.fetchVoices()
        } catch {
            // silently fall back; voice preset is optional UX sugar
            print("voices load failed:", error)
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
        script: String,
        voiceId: String
    ) async throws -> UGCJob {
        var imageURL: String? = nil
        if let img = productImage {
            imageURL = try await service.uploadProductImage(img)
        }
        let job = try await service.startGeneration(
            UGCService.GenerateRequest(
                templateId: template.id,
                productName: productName,
                productDescription: productDescription,
                productImageURL: imageURL,
                script: script,
                voiceId: voiceId
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
