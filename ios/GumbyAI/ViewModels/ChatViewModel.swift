import SwiftUI
import PhotosUI
import UIKit

/// One reference image attached to the composer or the studio form. Mirrors
/// the web `ComposerAttachment` / `AttachmentState`: a local preview while
/// the file is in hand, plus the remote URL once the upload to
/// `/ugc/upload-attachment` lands. `image` is nil when the attachment was
/// carried over from the composer (we only have the URL by then).
struct StudioAttachment: Identifiable, Equatable {
    let id: UUID
    var image: UIImage?
    var remoteUrl: String      // "" while uploading
    var uploading: Bool
    var failed: Bool
}

/// The studio funnel — a 1:1 port of `web/app/(app)/studio/page.tsx`.
///
/// The flow is unified and free-form: the user writes one prompt, optionally
/// attaches up to five reference images (the backend classifies each image's
/// role itself), and hits Generate. There is no `/parse-prompt` round-trip,
/// no structured product/creator fields, no multi-draft stack, and no
/// standalone Kling text-to-video "creator generation" — the website removed
/// all of those, so iOS matches.
///
///   welcome → studio → generatingAd → adDone
///
/// Picking a "Featured creator" (or a history "Use creator") drops the user
/// into the same studio form with that creator fixed as the on-camera person.
@MainActor
class ChatViewModel: ObservableObject {

    // MARK: - Funnel state

    @Published var step: UGCChatStep = .welcome

    // MARK: - Composer (welcome) state

    @Published var composerPrompt: String = ""
    @Published var composerAspectRatio: String = "9:16"
    @Published var composerDuration: Int = 10
    @Published var composerError: String?
    @Published var composerAttachments: [StudioAttachment] = []

    /// Matches web's `MAX_ATTACHMENTS = 5` in both the composer and the form.
    static let MAX_ATTACHMENTS: Int = 5

    // MARK: - Catalog (featured creators + Creators grid)

    @Published var templates: [UGCTemplate] = []
    @Published var isLoadingTemplates: Bool = false
    @Published var templatesError: String?

    // MARK: - Studio form (unified)

    /// Fixed creator image (set when arriving from a template / "use
    /// creator"). When non-nil the ad stars this exact person; the user adds
    /// product images + the prompt exactly like the normal flow.
    @Published var formCreatorImageUrl: String?
    @Published var formCreatorName: String?

    @Published var formPrompt: String = ""
    @Published var formAttachments: [StudioAttachment] = []
    @Published var formAspectRatio: String = "9:16"
    @Published var formDuration: Int = 10
    @Published var formCreatorSpeaks: Bool = true
    @Published var formScript: String = ""
    @Published var formIsGeneratingScript: Bool = false
    @Published var formScriptError: String?
    @Published var formCaptionsEnabled: Bool = true
    @Published var formCaptionPresetId: String = CaptionPreset.defaultId
    @Published var formError: String?

    // MARK: - Ad generation

    @Published var activeJob: UGCJob?
    @Published var isGenerating: Bool = false

    // MARK: - Credits / paywall

    @Published var showPaywall: Bool = false
    @Published var paywallContext: String?

    // MARK: - Services

    private let service = UGCService.shared
    private var pollTask: Task<Void, Never>?

    /// On-device credit ledger, injected from the app on launch. The full ad
    /// pipeline is credit-gated (50 for ≤7s, 100 for 8–12s, 150 for ≥13s),
    /// matching the backend.
    weak var credits: CreditsManager?

    func attachCredits(_ manager: CreditsManager) { self.credits = manager }

    func presentPaywall(context: String? = nil) {
        paywallContext = context
        showPaywall = true
    }

    // MARK: - Init

    init() {
        Task { await self.loadTemplates(force: false) }
    }

    // MARK: - Catalog

    func loadTemplates(force: Bool = false) async {
        if !force, !templates.isEmpty { return }
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            // No reordering — the website renders `listTemplates(1)` as-is.
            let fetched = try await service.fetchTemplates(page: 1)
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

    // MARK: - Navigation

    func advance(to newStep: UGCChatStep) {
        guard newStep != step else { return }
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = newStep
        }
    }

    /// Mirrors web's `reset()` / the logo "fresh studio" event — back to the
    /// welcome composer with everything cleared.
    func newConversation() {
        stopPolling()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
            step = .welcome
            composerPrompt = ""
            composerAspectRatio = "9:16"
            composerDuration = 10
            composerError = nil
            composerAttachments = []
            clearForm()
            activeJob = nil
            isGenerating = false
        }
    }

    private func clearForm() {
        formCreatorImageUrl = nil
        formCreatorName = nil
        formPrompt = ""
        formAttachments = []
        formAspectRatio = "9:16"
        formDuration = 10
        formCreatorSpeaks = true
        formScript = ""
        formIsGeneratingScript = false
        formScriptError = nil
        formCaptionsEnabled = true
        formCaptionPresetId = CaptionPreset.defaultId
        formError = nil
    }

    private func resetGeneration() {
        stopPolling()
        activeJob = nil
        isGenerating = false
        formError = nil
    }

    // MARK: - Compatibility shims (share-to-chat from Library / Explore)

    func attachAsset(url: String) {
        if step < .studio {
            clearForm()
            formPrompt = composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if formAttachments.count < Self.MAX_ATTACHMENTS,
           !formAttachments.contains(where: { $0.remoteUrl == url }) {
            formAttachments.append(
                StudioAttachment(id: UUID(), image: nil, remoteUrl: url, uploading: false, failed: false)
            )
        }
        advance(to: .studio)
    }

    // MARK: - Attachment uploads

    func addComposerAttachment(_ image: UIImage) {
        guard composerAttachments.count < Self.MAX_ATTACHMENTS else { return }
        let id = UUID()
        composerAttachments.append(
            StudioAttachment(id: id, image: image, remoteUrl: "", uploading: true, failed: false)
        )
        uploadAttachment(image, id: id, isComposer: true)
    }

    func removeComposerAttachment(id: UUID) {
        composerAttachments.removeAll { $0.id == id }
    }

    func addFormAttachment(_ image: UIImage) {
        guard formAttachments.count < Self.MAX_ATTACHMENTS else { return }
        let id = UUID()
        formAttachments.append(
            StudioAttachment(id: id, image: image, remoteUrl: "", uploading: true, failed: false)
        )
        uploadAttachment(image, id: id, isComposer: false)
    }

    func removeFormAttachment(id: UUID) {
        formAttachments.removeAll { $0.id == id }
    }

    private func uploadAttachment(_ image: UIImage, id: UUID, isComposer: Bool) {
        Task {
            do {
                let url = try await self.service.uploadAttachment(image)
                await MainActor.run {
                    if isComposer {
                        if let i = self.composerAttachments.firstIndex(where: { $0.id == id }) {
                            self.composerAttachments[i].remoteUrl = url
                            self.composerAttachments[i].uploading = false
                        }
                    } else {
                        if let i = self.formAttachments.firstIndex(where: { $0.id == id }) {
                            self.formAttachments[i].remoteUrl = url
                            self.formAttachments[i].uploading = false
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    // Drop the failed thumbnail and surface the reason. The
                    // server rejects nudity/explicit content with a 422 whose
                    // message is already user-facing.
                    let message = self.uploadErrorMessage(error)
                    if isComposer {
                        self.composerAttachments.removeAll { $0.id == id }
                        self.composerError = message
                    } else {
                        self.formAttachments.removeAll { $0.id == id }
                        self.formError = message
                    }
                }
            }
        }
    }

    private func uploadErrorMessage(_ error: Error) -> String {
        if case APIError.custom(let msg) = error, !msg.isEmpty { return msg }
        return "Image upload failed. Try a different photo."
    }

    // MARK: - Composer → studio hand-off

    var composerRemoteURLs: [String] {
        composerAttachments.compactMap { $0.remoteUrl.isEmpty ? nil : $0.remoteUrl }
    }

    var canSubmitComposer: Bool {
        composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10
            && !composerAttachments.contains(where: { $0.uploading })
    }

    /// The "proceed" half of the composer submit — seeds the studio form and
    /// advances. The rights-confirmation gate is owned by the composer view
    /// (it presents the modal and calls this once the user confirms),
    /// matching web's `PromptComposer.submit()` → `proceed()`.
    func submitComposer() {
        let prompt = composerPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard prompt.count >= 10 else {
            composerError = "Describe your video in a sentence or two."
            return
        }
        guard !composerAttachments.contains(where: { $0.uploading }) else { return }
        composerError = nil

        resetGeneration()
        formCreatorImageUrl = nil
        formCreatorName = nil
        formPrompt = prompt
        // Carry the already-loaded UIImage across (not just the URL) so the
        // studio form shows instant, reliable previews instead of blank cards
        // while it re-fetches each image from Supabase via AsyncImage.
        formAttachments = composerAttachments
            .filter { !$0.remoteUrl.isEmpty }
            .map { StudioAttachment(id: UUID(), image: $0.image, remoteUrl: $0.remoteUrl, uploading: false, failed: false) }
        formAspectRatio = composerAspectRatio
        formDuration = composerDuration
        formCreatorSpeaks = true
        formScript = ""
        formCaptionsEnabled = true
        formCaptionPresetId = CaptionPreset.defaultId
        formScriptError = nil

        advance(to: .studio)
    }

    // MARK: - Pick a creator (template / history hand-off)

    /// Mirrors web's `useTemplate(tpl)`: the creator's still becomes the
    /// fixed creator image and the rest of the flow is identical.
    func pickTemplate(_ tpl: UGCTemplate) {
        let imageUrl = !tpl.thumbnailURL.isEmpty
            ? tpl.thumbnailURL
            : (tpl.actorAvatarURL ?? "")
        guard !imageUrl.isEmpty else { return } // no usable still — ignore

        resetGeneration()
        formCreatorImageUrl = imageUrl
        formCreatorName = tpl.actorName.isEmpty ? tpl.name : tpl.actorName
        formPrompt = ""
        formAttachments = []
        formAspectRatio = ["9:16", "16:9", "1:1"].contains(tpl.aspectRatio) ? tpl.aspectRatio : "9:16"
        formDuration = 10
        formCreatorSpeaks = true
        formScript = tpl.sampleScript     // templates ship a sample script
        formCaptionsEnabled = true
        formCaptionPresetId = CaptionPreset.defaultId
        formScriptError = nil

        advance(to: .studio)
    }

    // MARK: - Script (AI)

    func generateScriptForForm() async {
        let prompt = formPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty else {
            formScriptError = "Write the prompt first — the AI uses it to draft the script."
            return
        }
        formIsGeneratingScript = true
        formScriptError = nil
        defer { formIsGeneratingScript = false }

        // The first request often hits a cold backend (Railway spins the
        // process back up) and fails, then succeeds a few seconds later —
        // which is why clicking again "just worked". Retry once automatically
        // after a short delay so the user never has to double-tap.
        do {
            let script = try await generateScriptWithRetry(prompt: prompt)
            withAnimation(.easeOut(duration: 0.25)) { self.formScript = script }
        } catch {
            formScriptError = "Could not generate a script. Try again or write your own."
        }
    }

    private func generateScriptWithRetry(prompt: String, attempts: Int = 2) async throws -> String {
        var lastError: Error?
        for attempt in 0..<attempts {
            do {
                return try await service.generateScriptUnified(prompt: prompt, targetSeconds: formDuration)
            } catch {
                lastError = error
                if attempt < attempts - 1 {
                    try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5s before retry
                }
            }
        }
        throw lastError ?? APIError.noData
    }

    // MARK: - Generate

    var formRemoteURLs: [String] {
        formAttachments.compactMap { $0.remoteUrl.isEmpty ? nil : $0.remoteUrl }
    }

    var canGenerate: Bool {
        formPrompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 8
            && !formAttachments.contains(where: { $0.uploading })
            && (!formCreatorSpeaks || !formScript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    /// Validates like web's `StudioForm.submit()`. If uploaded images still
    /// need rights confirmation, calls `showRights` instead of generating —
    /// the form view owns the modal and calls `confirmRightsAndGenerate()`.
    func attemptGenerate(showRights: () -> Void) {
        guard !isGenerating else { return }
        let prompt = formPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if prompt.count < 8 {
            formError = "Describe the scene in a sentence or two."
            return
        }
        if formAttachments.contains(where: { $0.uploading }) {
            formError = "Wait for your images to finish uploading."
            return
        }
        if formCreatorSpeaks && formScript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            formError = "Write or generate a script (or turn off \"Talking creator\")."
            return
        }
        formError = nil
        let urls = formRemoteURLs
        if ImageRights.hasUnconfirmed(urls) {
            showRights()
            return
        }
        generateAd(remoteUrls: urls)
    }

    func confirmRightsAndGenerate() {
        let urls = formRemoteURLs
        ImageRights.markConfirmed(urls)
        generateAd(remoteUrls: urls)
    }

    private func generateAd(remoteUrls: [String]) {
        guard !isGenerating else { return }

        // ---- Credit preflight (mirrors backend: 50 ≤7s, 100 8–12s, 150 ≥13s) ----
        let duration = formDuration
        let requiredCredits = credits?.cost(forSeconds: duration) ?? 0
        if let credits, !credits.hasSufficient(forSeconds: duration) {
            let shortfall = max(0, requiredCredits - credits.balance)
            presentPaywall(
                context: "This video costs \(requiredCredits) credits — you need \(shortfall) more."
            )
            return
        }

        isGenerating = true
        formError = nil

        let speaks = formCreatorSpeaks
        let req = UGCService.AdRequest(
            prompt: formPrompt.trimmingCharacters(in: .whitespacesAndNewlines),
            attachmentUrls: remoteUrls,
            creatorImageUrl: formCreatorImageUrl,
            script: speaks ? formScript : "",
            creatorSpeaks: speaks,
            videoDuration: duration,
            aspectRatio: formAspectRatio,
            captionsEnabled: speaks && formCaptionsEnabled,
            captionPresetId: (speaks && formCaptionsEnabled) ? formCaptionPresetId : nil
        )

        Task {
            do {
                let job = try await service.startAdGeneration(req)
                // Debit now that we have a stable job id (mirrors backend's
                // debit-on-accept; refunded if the job later fails).
                if let credits, requiredCredits > 0 {
                    try? await credits.spend(amount: requiredCredits, jobID: job.id)
                }
                self.activeJob = job
                self.isGenerating = false
                self.advance(to: .generatingAd)
                self.startPolling(jobId: job.id, duration: duration)
            } catch {
                self.isGenerating = false
                if case APIError.insufficientCredits(_, let required) = error {
                    let need = required ?? requiredCredits
                    self.presentPaywall(context: "This video costs \(need) credits.")
                } else {
                    self.formError = error.localizedDescription
                }
            }
        }
    }

    /// VideoResult "regenerate" / ad_done back-to-form, keeping the entered
    /// values so the user can tweak and re-generate.
    func regenerateFromResult() {
        advance(to: .studio)
    }

    // MARK: - Polling

    private func startPolling(jobId: String, duration: Int) {
        stopPolling()
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                if Task.isCancelled { break }
                do {
                    let updated = try await self.service.fetchJob(id: jobId)
                    await MainActor.run {
                        self.activeJob = updated
                        if updated.status == .completed {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                                self.step = .adDone
                            }
                        } else if updated.status == .failed {
                            // Refund the debit (idempotent on job id).
                            if let credits = self.credits {
                                let amt = credits.cost(forSeconds: duration)
                                Task { await credits.refund(amount: amt, jobID: updated.id) }
                            }
                            self.formError = updated.error ?? "Ad generation failed"
                            self.step = .studio
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

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }
}
