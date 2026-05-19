import SwiftUI
import PhotosUI
import UIKit

/// The AI chat in Gumby is a guided UGC video studio with three flows that
/// converge in the same lip-sync pipeline:
///
///   A. Models tab → user picks a curated template → chat lands on
///      `productEntry` with `pickedTemplate` populated.
///   B. Chat composer → user types a free-form prompt → backend runs Kling
///      2.6 Pro text-to-video → `creatorReady` shows the silent clip → user
///      taps "Make a full ad", which promotes the creator into a hidden
///      `UGCTemplate` row and routes into the same lip-sync funnel.
///   C. Same as (B) but the user taps "Just save this clip" → terminates at
///      `standaloneComplete` with the silent creator video.
///
/// This view model owns the funnel state, the in-flight creator job (B/C),
/// the in-flight ad job (A/B), the per-step async work, and two independent
/// polling tasks. The view layer is responsible only for rendering each
/// step's card.
@MainActor
class ChatViewModel: ObservableObject {
    // MARK: - Funnel state

    @Published var step: UGCChatStep = .welcome

    // MARK: - Composer (welcome) state

    /// Free-form text prompt for the standalone creator generation. Has to
    /// be at least a few words long to actually fire the backend job.
    @Published var composerPrompt: String = ""
    @Published var composerAspectRatio: String = "9:16"
    @Published var composerDuration: Int = 5
    @Published var composerError: String?
    @Published var isStartingCreator: Bool = false

    // MARK: - Catalog

    @Published var templates: [UGCTemplate] = []
    @Published var voices: [UGCVoicePreset] = []
    @Published var isLoadingTemplates: Bool = false
    @Published var templatesError: String?

    @Published var pickedTemplate: UGCTemplate?
    @Published var selectedVoiceId: String = ""

    // MARK: - Standalone creator (flows B & C)

    /// In-flight or completed Kling 2.6 text-to-video creator job. Distinct
    /// from `activeJob` (which is the lip-sync pipeline).
    @Published var activeCreatorJob: UGCCreatorJob?
    @Published var creatorError: String?
    @Published var isPromotingCreator: Bool = false

    // MARK: - Product

    @Published var productName: String = ""
    @Published var productDescription: String = ""
    @Published var productTone: String = ""
    @Published var productImage: UIImage?
    @Published var productImageURL: String?
    @Published var productPhotoItem: PhotosPickerItem?

    // MARK: - Script

    @Published var script: String = ""
    @Published var isGeneratingScript: Bool = false
    @Published var scriptError: String?

    // MARK: - Ad generation (lip-sync pipeline)

    @Published var activeJob: UGCJob?
    @Published var isSubmittingJob: Bool = false
    @Published var submitError: String?

    // MARK: - Services

    private let service = UGCService.shared
    private var pollTask: Task<Void, Never>?
    private var creatorPollTask: Task<Void, Never>?

    // MARK: - Init

    init() {
        Task { await self.bootstrap() }
    }

    private func bootstrap() async {
        await loadTemplates(force: false)
        await loadVoices()
    }

    // MARK: - Catalog

    func loadTemplates(force: Bool = false) async {
        if !force, !templates.isEmpty { return }
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            let fetched = try await service.fetchTemplates(page: 1)
            self.templates = fetched
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
            // voices are best-effort, the picker will still show defaults
        }
    }

    // MARK: - Navigation

    /// Advances the chat to the next logical step with a soft animation.
    func advance(to newStep: UGCChatStep) {
        guard newStep != step else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = newStep
        }
    }

    /// Sends the user back to a previous step so they can edit a choice.
    func revisit(_ targetStep: UGCChatStep) {
        guard targetStep < step else { return }
        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
            step = targetStep
        }
    }

    /// Resets the entire chat (called by the "New chat" pencil button and by
    /// the "Make another" CTA on the result cards).
    func newConversation() {
        stopAllPolling()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = .welcome
            composerPrompt = ""
            composerAspectRatio = "9:16"
            composerDuration = 5
            composerError = nil
            isStartingCreator = false
            pickedTemplate = nil
            activeCreatorJob = nil
            creatorError = nil
            isPromotingCreator = false
            productName = ""
            productDescription = ""
            productTone = ""
            productImage = nil
            productImageURL = nil
            productPhotoItem = nil
            script = ""
            isGeneratingScript = false
            scriptError = nil
            selectedVoiceId = ""
            activeJob = nil
            isSubmittingJob = false
            submitError = nil
        }
    }

    // MARK: - Compatibility shims

    /// Library / Explore screens drop an asset URL into the chat. We
    /// interpret it as "use this image as the product photo" so the
    /// existing integrations still feel natural in the UGC funnel.
    func attachAsset(url: String) {
        productImageURL = url
        productImage = nil
        if !step.isLipsyncBranch && step != .complete {
            // If they attached an asset without picking/generating a creator
            // yet, surface the template picker first so the funnel order
            // stays sane.
            advance(to: max(step, .templatePicker))
        }
    }

    /// History view calls this when reopening a past conversation. UGC chat
    /// sessions are not persisted in the messages table, so reopening a chat
    /// simply starts a fresh funnel for now.
    func loadConversation(_ id: String, title: String? = nil) async {
        _ = id; _ = title
        newConversation()
    }

    // MARK: - Composer (flows B & C)

    /// Validates the composer prompt and kicks off a Kling 2.6 creator job.
    /// The user lands on `.generatingCreator` immediately so they see a live
    /// progress card while the backend works.
    func submitCreatorPrompt() {
        let prompt = composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard prompt.count >= 6 else {
            composerError = "Describe your creator in a few more words."
            return
        }
        composerError = nil
        Task { await self.startCreatorGeneration(prompt: prompt) }
    }

    private func startCreatorGeneration(prompt: String) async {
        guard !isStartingCreator else { return }
        isStartingCreator = true
        creatorError = nil
        composerError = nil
        defer { isStartingCreator = false }
        do {
            let job = try await service.startCreatorGeneration(
                UGCService.CreatorRequest(
                    prompt: prompt,
                    aspectRatio: composerAspectRatio,
                    durationSeconds: composerDuration
                )
            )
            self.activeCreatorJob = job
            advance(to: .generatingCreator)
            startCreatorPollingIfNeeded()
        } catch {
            composerError = error.localizedDescription
        }
    }

    /// Opens the curated carousel from the composer.
    func openTemplatePicker() {
        advance(to: .templatePicker)
    }

    // MARK: - creatorReady actions

    /// User chose option (B): turn the standalone creator into a full ad.
    /// We promote the job into a hidden ugc_templates row and route into
    /// the shared lip-sync funnel.
    func useCreatorForFullAd() {
        guard let job = activeCreatorJob, job.status == .completed else { return }
        guard !isPromotingCreator else { return }
        isPromotingCreator = true
        creatorError = nil
        Task {
            do {
                let template = try await self.service.promoteCreatorToTemplate(
                    jobId: job.id,
                    actorName: "Your creator",
                    sampleScript: nil
                )
                await MainActor.run {
                    self.pickedTemplate = template
                    if self.selectedVoiceId.isEmpty {
                        self.selectedVoiceId = template.voiceId
                    }
                    self.isPromotingCreator = false
                    self.advance(to: .productEntry)
                }
            } catch {
                await MainActor.run {
                    self.isPromotingCreator = false
                    self.creatorError = error.localizedDescription
                }
            }
        }
    }

    /// User chose option (C): keep the silent creator clip and stop here.
    func keepCreatorAsStandalone() {
        stopCreatorPolling()
        advance(to: .standaloneComplete)
    }

    /// User wants to throw away the generated creator and try a different
    /// prompt. Reset back to the composer.
    func discardCreatorAndRestart() {
        stopCreatorPolling()
        activeCreatorJob = nil
        creatorError = nil
        advance(to: .welcome)
    }

    // MARK: - Template pick (flow A)

    func pickTemplate(_ template: UGCTemplate) {
        let switchedTemplate = pickedTemplate?.id != template.id
        pickedTemplate = template
        if selectedVoiceId.isEmpty || switchedTemplate {
            selectedVoiceId = template.voiceId
        }
        advance(to: .productEntry)
    }

    // MARK: - Product step

    /// Called when the user commits product info from the product card.
    /// Kicks the funnel forward and immediately fires an AI script draft so
    /// the next card has something the user can react to.
    func submitProduct() {
        guard let template = pickedTemplate else { return }
        guard !productName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        advance(to: .scriptDraft)
        if script.trimmingCharacters(in: .whitespaces).isEmpty {
            Task { await self.generateScript(for: template) }
        }
    }

    // MARK: - Script step

    func generateScript(for template: UGCTemplate? = nil) async {
        let target = template ?? pickedTemplate
        guard let target else { return }
        guard !productName.trimmingCharacters(in: .whitespaces).isEmpty else {
            scriptError = "Add a product name first."
            return
        }
        isGeneratingScript = true
        scriptError = nil
        defer { isGeneratingScript = false }
        do {
            let req = UGCService.ScriptRequest(
                productName: productName,
                productDescription: productDescription,
                template: target,
                tone: productTone
            )
            let result = try await service.generateScript(req)
            withAnimation(.easeOut(duration: 0.25)) {
                self.script = result
            }
        } catch {
            scriptError = error.localizedDescription
        }
    }

    func approveScript() {
        guard !script.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        advance(to: .voicePicker)
    }

    // MARK: - Voice step

    func approveVoice() {
        if selectedVoiceId.isEmpty {
            selectedVoiceId = pickedTemplate?.voiceId ?? "Rachel"
        }
        Task { await self.startGeneration() }
    }

    // MARK: - Lip-sync pipeline

    private func startGeneration() async {
        guard let template = pickedTemplate else { return }
        guard !script.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        guard !isSubmittingJob else { return }
        isSubmittingJob = true
        submitError = nil
        defer { isSubmittingJob = false }

        do {
            var imageURL = productImageURL
            if imageURL == nil, let img = productImage {
                imageURL = try await service.uploadProductImage(img)
                self.productImageURL = imageURL
            }
            let job = try await service.startGeneration(
                UGCService.GenerateRequest(
                    templateId: template.id,
                    productName: productName,
                    productDescription: productDescription,
                    productImageURL: imageURL,
                    script: script,
                    voiceId: selectedVoiceId.isEmpty ? template.voiceId : selectedVoiceId
                )
            )
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                self.activeJob = job
                self.step = .generating
            }
            startPollingIfNeeded()
        } catch {
            submitError = error.localizedDescription
        }
    }

    // MARK: - Polling (lip-sync pipeline)

    private func startPollingIfNeeded() {
        guard pollTask == nil else { return }
        guard let job = activeJob, !job.status.isTerminal else { return }
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if Task.isCancelled { break }
                await self.refreshActiveJob()
                let stillRunning = await MainActor.run { () -> Bool in
                    guard let j = self.activeJob else { return false }
                    return !j.status.isTerminal
                }
                if !stillRunning { break }
            }
            await MainActor.run { self.pollTask = nil }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func refreshActiveJob() async {
        guard let id = activeJob?.id else { return }
        do {
            let updated = try await service.fetchJob(id: id)
            await MainActor.run {
                self.activeJob = updated
                if updated.status == .completed {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                        self.step = .complete
                    }
                }
            }
        } catch {
            // single failure shouldn't kill polling
        }
    }

    // MARK: - Polling (creator generation)

    private func startCreatorPollingIfNeeded() {
        guard creatorPollTask == nil else { return }
        guard let job = activeCreatorJob, !job.status.isTerminal else { return }
        creatorPollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if Task.isCancelled { break }
                await self.refreshCreatorJob()
                let stillRunning = await MainActor.run { () -> Bool in
                    guard let j = self.activeCreatorJob else { return false }
                    return !j.status.isTerminal
                }
                if !stillRunning { break }
            }
            await MainActor.run { self.creatorPollTask = nil }
        }
    }

    private func stopCreatorPolling() {
        creatorPollTask?.cancel()
        creatorPollTask = nil
    }

    private func stopAllPolling() {
        stopPolling()
        stopCreatorPolling()
    }

    private func refreshCreatorJob() async {
        guard let id = activeCreatorJob?.id else { return }
        do {
            let updated = try await service.fetchCreatorJob(id: id)
            await MainActor.run {
                self.activeCreatorJob = updated
                switch updated.status {
                case .completed:
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                        self.step = .creatorReady
                    }
                case .failed:
                    self.creatorError = updated.error ?? "Creator generation failed"
                default:
                    break
                }
            }
        } catch {
            // single failure shouldn't kill polling
        }
    }

    // MARK: - Photo picker plumbing

    func loadProductPhoto() async {
        guard let item = productPhotoItem else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let img = UIImage(data: data) {
            productImage = img
            productImageURL = nil // will re-upload on submit
        }
    }

    func clearProductImage() {
        productImage = nil
        productImageURL = nil
        productPhotoItem = nil
    }

    // MARK: - Convenience

    var canSubmitProduct: Bool {
        !productName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var canApproveScript: Bool {
        !script.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Returns true when the composer text is long enough to actually fire a
    /// creator generation job (matches the backend's `MIN_PROMPT_LEN`).
    var canSubmitCreatorPrompt: Bool {
        composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 6
    }
}
