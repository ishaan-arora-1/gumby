import SwiftUI
import PhotosUI
import UIKit

/// The AI chat in Gumby is a guided UGC video studio with three flows that
/// converge on the studio card:
///
///   A. Models tab → user picks a curated template → chat lands on `.studio`
///      with `pickedTemplate` populated.
///   B. Chat composer → user types a free-form prompt → backend runs Kling
///      3.0 Pro text-to-video → `creatorReady` shows the silent clip → user
///      taps "Make a full ad", which promotes the creator into a hidden
///      `UGCTemplate` row and routes into the studio.
///   C. Same as (B) but the user taps "Just save this clip" → terminates at
///      `standaloneComplete` with the silent creator video.
///
/// Final ad generation is a single Kling 3.0 Pro call with built-in audio +
/// lip-sync — no TTS, no voice picker, no shot plan, no B-roll.
@MainActor
class ChatViewModel: ObservableObject {
    // MARK: - Funnel state

    @Published var step: UGCChatStep = .welcome

    // MARK: - Composer (welcome) state

    @Published var composerPrompt: String = ""
    @Published var composerAspectRatio: String = "9:16"
    @Published var composerDuration: Int = 5
    @Published var composerError: String?
    @Published var isStartingCreator: Bool = false

    /// Up to MAX_COMPOSER_ATTACHMENTS images attached to the welcome
    /// composer. Each is uploaded to /ugc/upload-attachment as soon as
    /// the user picks it; the resulting URL is sent to /parse-prompt
    /// for vision classification (product / inspiration / both) which
    /// then routes the URL into the studio draft's product or
    /// inspiration slot — or both, for a creator-with-product shot.
    struct ComposerAttachment: Identifiable, Equatable {
        let id: UUID
        var image: UIImage
        var remoteURL: String?
        var uploading: Bool
        var failed: Bool
    }
    @Published var composerAttachments: [ComposerAttachment] = []
    static let MAX_COMPOSER_ATTACHMENTS: Int = 2

    // MARK: - Catalog

    @Published var templates: [UGCTemplate] = []
    @Published var isLoadingTemplates: Bool = false
    @Published var templatesError: String?

    @Published var pickedTemplate: UGCTemplate?

    // MARK: - Library

    enum WelcomeFeed: String, CaseIterable, Hashable {
        case templates = "Templates"
        case library = "Library"
    }
    @Published var welcomeFeed: WelcomeFeed = .templates
    @Published var library: [UGCCreatorJob] = []
    @Published var isLoadingLibrary: Bool = false
    @Published var libraryError: String?

    // MARK: - Standalone creator (flows B & C)

    @Published var activeCreatorJob: UGCCreatorJob?
    @Published var creatorError: String?
    @Published var isPromotingCreator: Bool = false

    // MARK: - Ad generation

    @Published var activeJob: UGCJob?
    @Published var isSubmittingJob: Bool = false
    @Published var submitError: String?

    // MARK: - Studio drafts (iterative regeneration)

    @Published var drafts: [UGCDraft] = []
    @Published var activeDraftIndex: Int = 0

    var activeDraft: UGCDraft? {
        drafts.indices.contains(activeDraftIndex) ? drafts[activeDraftIndex] : nil
    }

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
        await loadLibrary(force: false)
    }

    // MARK: - Catalog

    func loadTemplates(force: Bool = false) async {
        if !force, !templates.isEmpty { return }
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            var fetched = try await service.fetchTemplates(page: 1)
            if fetched.count >= 2 {
                fetched.swapAt(0, fetched.count - 1)
            }
            self.templates = fetched
            VideoPreloader.shared.preload(urlStrings: fetched.map { $0.videoURL })
            templatesError = nil
        } catch {
            templatesError = error.localizedDescription
        }
    }

    func ensureTemplatesLoaded() async {
        guard templates.isEmpty else { return }
        await loadTemplates(force: true)
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

    func useLibraryItem(_ creator: UGCCreatorJob) {
        guard creator.status == .completed else { return }
        guard !isPromotingCreator else { return }
        isPromotingCreator = true
        creatorError = nil
        Task {
            do {
                let template = try await self.service.promoteCreatorToTemplate(
                    jobId: creator.id,
                    actorName: "Your creator",
                    sampleScript: nil
                )
                await MainActor.run {
                    self.resetFunnelStateForNewRun()
                    self.pickedTemplate = template
                    self.isPromotingCreator = false
                    self.activeCreatorJob = creator
                    self.createFirstDraft()
                    self.advance(to: .studio)
                }
            } catch {
                await MainActor.run {
                    self.isPromotingCreator = false
                    self.creatorError = error.localizedDescription
                }
            }
        }
    }

    // MARK: - Navigation

    func advance(to newStep: UGCChatStep) {
        guard newStep != step else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = newStep
        }
    }

    func revisit(_ targetStep: UGCChatStep) {
        guard targetStep < step else { return }
        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
            step = targetStep
        }
    }

    func newConversation() {
        stopAllPolling()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = .welcome
            composerPrompt = ""
            composerAspectRatio = "9:16"
            composerDuration = 5
            composerError = nil
            isStartingCreator = false
            isParsingPrompt = false
            composerAttachments = []
            pickedTemplate = nil
            activeCreatorJob = nil
            creatorError = nil
            isPromotingCreator = false
            activeJob = nil
            isSubmittingJob = false
            submitError = nil
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            self.drafts = []
            self.activeDraftIndex = 0
        }
    }

    // MARK: - Compatibility shims

    func attachAsset(url: String) {
        // Library / Explore dropped an asset URL — treat it as a product
        // image on the active draft (creating one if needed). Used by the
        // existing share-to-chat integrations.
        if drafts.isEmpty { createFirstDraft() }
        if drafts.indices.contains(activeDraftIndex) {
            drafts[activeDraftIndex].productImageURL = url
            drafts[activeDraftIndex].productImage = nil
        }
        if step < .studio {
            advance(to: .studio)
        }
    }

    func loadConversation(_ id: String, title: String? = nil) async {
        _ = id; _ = title
        newConversation()
    }

    // MARK: - Composer (flows B & C)

    func submitCreatorPrompt() {
        let prompt = composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard prompt.count >= 6 else {
            composerError = "Describe your creator in a few more words."
            return
        }
        composerError = nil
        Task { await self.startCreatorGeneration(prompt: prompt) }
    }

    // MARK: - Direct prompt (flow D — skip template, go straight to studio)

    @Published var isParsingPrompt: Bool = false

    func submitDirectPrompt() {
        let prompt = composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard prompt.count >= 10 else {
            composerError = "Describe your video in a bit more detail."
            return
        }
        guard !composerAttachments.contains(where: { $0.uploading }) else {
            composerError = "Wait for your images to finish uploading."
            return
        }
        composerError = nil
        isParsingPrompt = true
        let attachmentURLs = composerAttachments.compactMap { $0.remoteURL }
        Task {
            do {
                let parsed = try await service.parsePrompt(prompt, attachmentURLs: attachmentURLs)
                await MainActor.run {
                    self.isParsingPrompt = false
                    self.resetFunnelStateForNewRun()
                    self.pickedTemplate = nil

                    // Route classified attachments into product / inspiration
                    // slots. "both" lands in BOTH (creator-with-product); the
                    // pipeline dedups identical URLs. First-wins per kind so
                    // surplus attachments of the same kind are dropped.
                    var routedProductURL: String? = nil
                    var routedInspirationURL: String? = nil
                    for attachment in (parsed.attachments ?? []) {
                        switch attachment.kind {
                        case "both":
                            if routedProductURL == nil { routedProductURL = attachment.url }
                            if routedInspirationURL == nil { routedInspirationURL = attachment.url }
                        case "product":
                            if routedProductURL == nil { routedProductURL = attachment.url }
                        case "inspiration":
                            if routedInspirationURL == nil { routedInspirationURL = attachment.url }
                        default:
                            if routedInspirationURL == nil { routedInspirationURL = attachment.url }
                        }
                    }

                    var draft = UGCDraft.empty()
                    draft.creatorDescription = parsed.creatorDescription
                    draft.includeProduct = parsed.includeProduct
                    draft.productName = parsed.productName
                    draft.productDescription = parsed.productDescription
                    draft.videoDescription = parsed.videoDescription
                    draft.videoDuration = parsed.suggestedDuration
                    draft.productImageURL = routedProductURL
                    draft.inspirationImageURL = routedInspirationURL
                    self.drafts = [draft]
                    self.activeDraftIndex = 0

                    // Composer attachments handed off to the draft — clear so
                    // the next welcome session starts clean.
                    self.composerAttachments = []

                    self.advance(to: .studio)
                }
            } catch {
                await MainActor.run {
                    self.isParsingPrompt = false
                    self.composerError = error.localizedDescription
                }
            }
        }
    }

    // MARK: - Composer attachments

    /// Start uploading a freshly-picked image in the background. The
    /// attachment shows as a thumbnail immediately with a spinner;
    /// upload completion flips `remoteURL` and `uploading=false`.
    func addComposerAttachment(_ image: UIImage) {
        guard composerAttachments.count < Self.MAX_COMPOSER_ATTACHMENTS else { return }
        let id = UUID()
        composerAttachments.append(
            ComposerAttachment(id: id, image: image, remoteURL: nil, uploading: true, failed: false)
        )
        Task {
            do {
                let url = try await self.service.uploadAttachment(image)
                await MainActor.run {
                    if let idx = self.composerAttachments.firstIndex(where: { $0.id == id }) {
                        self.composerAttachments[idx].remoteURL = url
                        self.composerAttachments[idx].uploading = false
                    }
                }
            } catch {
                await MainActor.run {
                    if let idx = self.composerAttachments.firstIndex(where: { $0.id == id }) {
                        self.composerAttachments[idx].uploading = false
                        self.composerAttachments[idx].failed = true
                    }
                }
            }
        }
    }

    func removeComposerAttachment(id: UUID) {
        composerAttachments.removeAll(where: { $0.id == id })
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

    func openTemplatePicker() {
        advance(to: .templatePicker)
        Task { await self.ensureTemplatesLoaded() }
    }

    // MARK: - creatorReady actions

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
                    self.isPromotingCreator = false
                    self.createFirstDraft()
                    self.advance(to: .studio)
                }
            } catch {
                await MainActor.run {
                    self.isPromotingCreator = false
                    self.creatorError = error.localizedDescription
                }
            }
        }
    }

    func keepCreatorAsStandalone() {
        stopCreatorPolling()
        advance(to: .standaloneComplete)
    }

    func discardCreatorAndRestart() {
        stopCreatorPolling()
        activeCreatorJob = nil
        creatorError = nil
        advance(to: .welcome)
    }

    // MARK: - Template pick (flow A)

    func pickTemplate(_ template: UGCTemplate) {
        resetFunnelStateForNewRun()
        pickedTemplate = template
        createFirstDraft()
        advance(to: .studio)
    }

    private func resetFunnelStateForNewRun() {
        stopAllPolling()
        activeJob = nil
        isSubmittingJob = false
        submitError = nil
        drafts = []
        activeDraftIndex = 0
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

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
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
                    Task { await self.loadLibrary(force: true) }
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

    // MARK: - Convenience

    var canSubmitCreatorPrompt: Bool {
        composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 6
    }

    var canSubmitDirectPrompt: Bool {
        composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10
    }

    // MARK: - Studio draft lifecycle

    func createFirstDraft() {
        drafts = [UGCDraft.empty()]
        activeDraftIndex = 0
    }

    func regenerate() {
        guard let last = drafts.last else { return }
        let newDraft = UGCDraft.cloneFrom(last, number: drafts.count + 1)
        drafts.append(newDraft)
        activeDraftIndex = drafts.count - 1
    }

    /// Kicks off ad generation for the active studio draft. Works with both
    /// template mode (pickedTemplate != nil) and direct mode.
    func generateForActiveDraft() {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        guard drafts[activeDraftIndex].canGenerate else { return }
        let isDirectMode = pickedTemplate == nil
        if isDirectMode {
            guard !drafts[activeDraftIndex].creatorDescription
                .trimmingCharacters(in: .whitespaces).isEmpty else {
                drafts[activeDraftIndex].submitError = "Describe the creator for your video."
                return
            }
        }
        guard !drafts[activeDraftIndex].isSubmitting else { return }

        drafts[activeDraftIndex].isSubmitting = true
        drafts[activeDraftIndex].submitError = nil

        let draftIndex = activeDraftIndex
        Task {
            do {
                guard drafts.indices.contains(draftIndex) else { return }
                let hasProduct = drafts[draftIndex].includeProduct
                var imageURL = drafts[draftIndex].productImageURL
                if hasProduct, imageURL == nil, let img = drafts[draftIndex].productImage {
                    imageURL = try await service.uploadProductImage(img)
                    guard drafts.indices.contains(draftIndex) else { return }
                    drafts[draftIndex].productImageURL = imageURL
                }
                var inspirationURL = drafts[draftIndex].inspirationImageURL
                if inspirationURL == nil, let img = drafts[draftIndex].inspirationImage {
                    inspirationURL = try await service.uploadInspirationImage(img)
                    guard drafts.indices.contains(draftIndex) else { return }
                    drafts[draftIndex].inspirationImageURL = inspirationURL
                }

                let tweaks = drafts[draftIndex].creatorTweaks
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let job = try await service.startGeneration(
                    UGCService.GenerateRequest(
                        templateId: pickedTemplate?.id,
                        creatorDescription: isDirectMode
                            ? drafts[draftIndex].creatorDescription : nil,
                        creatorTweaks: (!isDirectMode && !tweaks.isEmpty) ? tweaks : nil,
                        productName: hasProduct ? drafts[draftIndex].productName : "",
                        productDescription: hasProduct ? drafts[draftIndex].productDescription : "",
                        productImageURL: hasProduct ? imageURL : nil,
                        inspirationImageURL: inspirationURL,
                        script: drafts[draftIndex].script,
                        videoDescription: drafts[draftIndex].videoDescription
                            .trimmingCharacters(in: .whitespacesAndNewlines),
                        videoDuration: drafts[draftIndex].videoDuration,
                        captionsEnabled: drafts[draftIndex].captionsEnabled,
                        captionPresetId: drafts[draftIndex].captionsEnabled
                            ? drafts[draftIndex].captionPresetId
                            : nil
                    )
                )
                guard drafts.indices.contains(draftIndex) else { return }
                drafts[draftIndex].isSubmitting = false
                drafts[draftIndex].job = job
                drafts[draftIndex].status = .generating
                activeJob = job
                startStudioPolling(draftIndex: draftIndex)
            } catch {
                guard drafts.indices.contains(draftIndex) else { return }
                drafts[draftIndex].isSubmitting = false
                drafts[draftIndex].submitError = error.localizedDescription
            }
        }
    }

    private func startStudioPolling(draftIndex: Int) {
        stopPolling()
        guard drafts.indices.contains(draftIndex),
              let job = drafts[draftIndex].job,
              !job.status.isTerminal else { return }

        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if Task.isCancelled { break }
                guard self.drafts.indices.contains(draftIndex),
                      let jobId = self.drafts[draftIndex].job?.id else { break }
                do {
                    let updated = try await self.service.fetchJob(id: jobId)
                    await MainActor.run {
                        guard self.drafts.indices.contains(draftIndex) else { return }
                        self.drafts[draftIndex].job = updated
                        self.activeJob = updated
                        if updated.status == .completed {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                                self.drafts[draftIndex].status = .completed
                            }
                        } else if updated.status == .failed {
                            self.drafts[draftIndex].status = .failed
                        }
                    }
                    if updated.status.isTerminal { break }
                } catch {
                    // single failure shouldn't kill polling
                }
            }
            await MainActor.run { self.pollTask = nil }
        }
    }

    /// AI script generation scoped to the active draft.
    func generateScriptForActiveDraft() async {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        let templateForScript: UGCTemplate
        if let tpl = pickedTemplate {
            templateForScript = tpl
        } else {
            let desc = drafts[activeDraftIndex].creatorDescription
            templateForScript = UGCTemplate(
                id: "direct",
                name: "Direct",
                actorName: desc,
                actorAvatarURL: nil,
                description: "",
                setting: "",
                videoURL: "",
                thumbnailURL: "",
                sampleScript: "",
                voiceId: "",
                aspectRatio: "9:16",
                durationSeconds: drafts[activeDraftIndex].videoDuration,
                tags: nil,
                category: ""
            )
        }
        let draftIndex = activeDraftIndex
        drafts[draftIndex].isGeneratingScript = true
        drafts[draftIndex].scriptError = nil
        defer {
            if drafts.indices.contains(draftIndex) {
                drafts[draftIndex].isGeneratingScript = false
            }
        }
        do {
            var req = UGCService.ScriptRequest(
                productName: drafts[draftIndex].productName,
                productDescription: drafts[draftIndex].productDescription,
                template: templateForScript,
                tone: drafts[draftIndex].productTone
            )
            req.targetSeconds = drafts[draftIndex].videoDuration
            let result = try await service.generateScript(req)
            guard drafts.indices.contains(draftIndex) else { return }
            withAnimation(.easeOut(duration: 0.25)) {
                self.drafts[draftIndex].script = result
            }
        } catch {
            guard drafts.indices.contains(draftIndex) else { return }
            drafts[draftIndex].scriptError = error.localizedDescription
        }
    }

    func loadProductPhotoForActiveDraft() async {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        let draftIndex = activeDraftIndex
        guard let item = drafts[draftIndex].productPhotoItem else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let img = UIImage(data: data) {
            guard drafts.indices.contains(draftIndex) else { return }
            drafts[draftIndex].productImage = img
            drafts[draftIndex].productImageURL = nil
        }
    }

    func clearProductImageForActiveDraft() {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        drafts[activeDraftIndex].productImage = nil
        drafts[activeDraftIndex].productImageURL = nil
        drafts[activeDraftIndex].productPhotoItem = nil
    }

    func loadInspirationPhotoForActiveDraft() async {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        let draftIndex = activeDraftIndex
        guard let item = drafts[draftIndex].inspirationPhotoItem else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let img = UIImage(data: data) {
            guard drafts.indices.contains(draftIndex) else { return }
            drafts[draftIndex].inspirationImage = img
            drafts[draftIndex].inspirationImageURL = nil
        }
    }

    func clearInspirationImageForActiveDraft() {
        guard drafts.indices.contains(activeDraftIndex) else { return }
        drafts[activeDraftIndex].inspirationImage = nil
        drafts[activeDraftIndex].inspirationImageURL = nil
        drafts[activeDraftIndex].inspirationPhotoItem = nil
    }
}







