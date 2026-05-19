import SwiftUI
import PhotosUI
import AVKit
import Photos

// MARK: - Shared card chrome

/// Wraps a step card in the same rounded surface used across the UGC chat so
/// every card feels visually consistent (active vs. collapsed states are
/// distinguished by a thin accent border on the active card).
struct UGCCardSurface<Content: View>: View {
    var active: Bool = true
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(AppConstants.chatComposerSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(
                        active ? AnyShapeStyle(AppConstants.accentGradient.opacity(0.55))
                               : AnyShapeStyle(Color.white.opacity(0.06)),
                        lineWidth: active ? 1.4 : 1
                    )
            )
            .shadow(color: .black.opacity(active ? 0.35 : 0.0), radius: 18, y: 8)
    }
}

/// Tiny header that lets a completed card explain itself and offers an Edit
/// button to drop the user back into that step.
struct UGCCardCompletedHeader: View {
    let title: String
    let subtitle: String?
    let onEdit: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            ZStack {
                Circle()
                    .fill(AppConstants.accentGradient)
                    .frame(width: 26, height: 26)
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundColor(.white)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.85))
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(AppConstants.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            if let onEdit {
                Button("Edit", action: onEdit)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
            }
        }
    }
}

/// Renders the "Gumby is talking" prompt above each active step. Mimics an
/// assistant turn so the screen still reads like a chat conversation, even
/// though the underlying content is structured.
struct UGCAssistantBubble: View {
    let text: String
    var emoji: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            ZStack {
                Circle()
                    .fill(AppConstants.accentGradient)
                    .frame(width: 30, height: 30)
                Image(systemName: emoji ?? "sparkles")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
            }
            Text(text)
                .font(.system(size: 15))
                .foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Welcome / composer card

/// The welcome card doubles as the chat's "composer". The user can either:
///   1. Describe a brand-new creator in free text and tap "Generate creator"
///      → the backend runs Kling 2.6 Pro text-to-video and we move to
///      `.generatingCreator`.
///   2. Tap the "Browse creators" affordance to open the curated carousel
///      (`.templatePicker`) and skip text generation entirely.
///   3. Land here from the Models tab — in that case the composer is
///      invisible because `chatVM.step` is already on `.productEntry`.
struct UGCChatWelcomeCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @FocusState private var promptFocused: Bool
    let userFirstName: String

    private let promptIdeas: [String] = [
        "Early 20s girl in a sunlit bedroom, holding up a beige hoodie, casual get-ready-with-me energy.",
        "Late 20s guy at a gym mirror, post-workout, talking about a new protein bar.",
        "Mid 20s creator in a soft pink bathroom holding a glass serum bottle, dewy lighting.",
        "College-age girl unboxing a small jewellery box at her desk, golden hour light.",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(AppConstants.accentGradient)
                Text("Hey \(userFirstName), let's shoot a UGC ad.")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Text("Describe the creator you want on camera — or browse our six hand-tuned models.")
                .font(.system(size: 14))
                .foregroundColor(AppConstants.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            promptInput

            Button(action: { chatVM.submitCreatorPrompt() }) {
                HStack(spacing: 10) {
                    if chatVM.isStartingCreator {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 15, weight: .heavy))
                    }
                    Text(chatVM.isStartingCreator ? "Starting…" : "Generate creator")
                        .font(.system(size: 16, weight: .heavy))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(chatVM.canSubmitCreatorPrompt && !chatVM.isStartingCreator
                              ? AnyShapeStyle(AppConstants.accentGradient)
                              : AnyShapeStyle(Color.white.opacity(0.12)))
                )
            }
            .disabled(!chatVM.canSubmitCreatorPrompt || chatVM.isStartingCreator)

            if let err = chatVM.composerError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }

            dividerLabel(text: "or")

            Button(action: { chatVM.openTemplatePicker() }) {
                HStack(spacing: 10) {
                    Image(systemName: "person.crop.rectangle.stack.fill")
                        .font(.system(size: 14, weight: .heavy))
                    Text("Browse our 6 creators")
                        .font(.system(size: 15, weight: .heavy))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundColor(.white.opacity(0.6))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                )
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Need inspo? Try one of these:")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                VStack(spacing: 8) {
                    ForEach(promptIdeas, id: \.self) { idea in
                        Button {
                            chatVM.composerPrompt = idea
                            promptFocused = true
                        } label: {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "lightbulb")
                                    .font(.system(size: 12))
                                    .foregroundColor(.white.opacity(0.75))
                                    .padding(.top, 2)
                                Text(idea)
                                    .font(.system(size: 12.5))
                                    .foregroundColor(.white.opacity(0.85))
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color.white.opacity(0.05))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 4)
        }
    }

    @ViewBuilder
    private var promptInput: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                if chatVM.composerPrompt.isEmpty {
                    Text("Describe your creator… age, vibe, setting, what they're showing off.")
                        .font(.system(size: 14))
                        .foregroundColor(AppConstants.chatPlaceholder)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $chatVM.composerPrompt)
                    .scrollContentBackground(.hidden)
                    .focused($promptFocused)
                    .frame(minHeight: 110)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .foregroundColor(.white)
                    .font(.system(size: 14))
            }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(AppConstants.chatComposerInner)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(
                        promptFocused
                            ? AnyShapeStyle(AppConstants.accentGradient.opacity(0.6))
                            : AnyShapeStyle(Color.white.opacity(0.06)),
                        lineWidth: 1
                    )
            )
        }
    }

    private func dividerLabel(text: String) -> some View {
        HStack(spacing: 10) {
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
            Text(text)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppConstants.textSecondary)
                .padding(.horizontal, 6)
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Generating-creator card (Kling 2.6 text-to-video in-flight)

/// Shown while Kling 2.6 is generating the on-camera creator from the user's
/// composer prompt. Mirrors the look of the lip-sync `UGCChatGeneratingCard`
/// but is wired to `chatVM.activeCreatorJob` instead of `activeJob`.
struct UGCChatGeneratingCreatorCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var pulse = false
    @State private var tipIndex = 0

    private let tips: [String] = [
        "Casting your creator on set…",
        "Lighting the scene…",
        "Framing the shot…",
        "Reviewing the take…",
        "Bringing the energy…",
    ]

    var body: some View {
        let job = chatVM.activeCreatorJob
        let progress = max(0.08, Double(job?.progress ?? 10) / 100.0)
        let status = job?.status.displayLabel ?? "Generating"

        VStack(alignment: .leading, spacing: 16) {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.18, green: 0.08, blue: 0.35),
                        Color(red: 0.05, green: 0.10, blue: 0.25),
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                VStack(spacing: 10) {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 28, weight: .heavy))
                        .foregroundStyle(AppConstants.accentGradient)
                        .scaleEffect(pulse ? 1.08 : 0.95)
                        .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true), value: pulse)
                    Text(tips[tipIndex])
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.92))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 18)
                        .transition(.opacity)
                        .id(tipIndex)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                Text("Generating your creator…")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundColor(.white)
                Text(chatVM.composerPrompt.isEmpty
                     ? "Kling 2.6 is rendering an on-camera persona for you."
                     : "Kling 2.6 is rendering: \"\(chatVM.composerPrompt.prefix(140))\(chatVM.composerPrompt.count > 140 ? "…" : "")\"")
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ProgressView(value: progress)
                .progressViewStyle(LinearProgressViewStyle())
                .tint(.white)
                .frame(height: 6)

            HStack {
                HStack(spacing: 6) {
                    Circle().fill(Color.green).frame(width: 8, height: 8)
                    Text(status)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                }
                Spacer()
                Text("\(job?.progress ?? 0)%")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
            }

            if let err = job?.error, job?.status == .failed {
                VStack(alignment: .leading, spacing: 10) {
                    Text(err)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                    Button {
                        chatVM.discardCreatorAndRestart()
                    } label: {
                        Text("Try a different prompt")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color.white.opacity(0.12)))
                    }
                }
            } else {
                Text("Kling text-to-video usually takes 60–120 seconds. You can hang out — we'll ping you the moment it's ready.")
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
            }
        }
        .onAppear {
            pulse = true
            startTipRotation()
        }
    }

    private func startTipRotation() {
        Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_800_000_000)
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.4)) {
                        tipIndex = (tipIndex + 1) % tips.count
                    }
                }
            }
        }
    }
}

// MARK: - Creator-ready card (silent clip preview with branching CTAs)

/// Shown once Kling 2.6 finishes. The user can either commit this creator to
/// a full lip-synced ad (flow B), save the standalone silent clip (flow C),
/// or throw it away and try a different prompt.
struct UGCChatCreatorReadyCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        let job = chatVM.activeCreatorJob

        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(AppConstants.accentGradient)
                Text("Your creator is ready")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundColor(.white)
                Spacer()
            }

            previewClip(videoURL: job?.videoURL)

            if let prompt = job?.prompt, !prompt.isEmpty {
                Text("\"\(prompt)\"")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.78))
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 10) {
                Button(action: { chatVM.useCreatorForFullAd() }) {
                    HStack(spacing: 10) {
                        if chatVM.isPromotingCreator {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "waveform.path.ecg")
                                .font(.system(size: 14, weight: .heavy))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chatVM.isPromotingCreator ? "Setting up…" : "Make a full ad with this creator")
                                .font(.system(size: 15, weight: .heavy))
                                .foregroundColor(.white)
                            Text("Add a script + voice, lip-sync over the clip.")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.82))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(.white.opacity(0.85))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(AppConstants.accentGradient)
                    )
                }
                .disabled(chatVM.isPromotingCreator || job?.status != .completed)

                Button(action: { chatVM.keepCreatorAsStandalone() }) {
                    HStack(spacing: 10) {
                        Image(systemName: "square.and.arrow.down")
                            .font(.system(size: 14, weight: .heavy))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Just save this clip")
                                .font(.system(size: 15, weight: .heavy))
                                .foregroundColor(.white)
                            Text("Keep the silent creator video as-is.")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(.white.opacity(0.6))
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(0.08))
                    )
                }

                Button(action: { chatVM.discardCreatorAndRestart() }) {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 12, weight: .bold))
                        Text("Try a different prompt")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white.opacity(0.7))
                    .padding(.top, 2)
                }
            }

            if let err = chatVM.creatorError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }
        }
    }

    @ViewBuilder
    private func previewClip(videoURL: String?) -> some View {
        ZStack {
            Color.black
            if let urlString = videoURL, let url = URL(string: urlString) {
                LoopingVideoView(url: url, isActive: true, muted: true, aspectFill: true)
            }
        }
        .aspectRatio(9.0/16.0, contentMode: .fit)
        .frame(maxWidth: 260)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .frame(maxWidth: .infinity, alignment: .center)
    }
}

// MARK: - Standalone complete card (flow C terminal)

/// Final state for users who generated a creator and chose not to layer a
/// script + voice on top of it. They can save the silent clip, share it,
/// promote it into a full ad after all, or start over.
struct UGCChatStandaloneResultCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

    var body: some View {
        let job = chatVM.activeCreatorJob
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(AppConstants.accentGradient)
                Text("Saved your creator")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundColor(.white)
                Spacer()
            }

            ZStack {
                Color.black
                if let urlString = job?.videoURL, let url = URL(string: urlString) {
                    LoopingVideoView(url: url, isActive: true, muted: true, aspectFill: true)
                }
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .frame(maxWidth: 260)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .frame(maxWidth: .infinity, alignment: .center)

            HStack(spacing: 10) {
                actionButton(label: "Save", system: "square.and.arrow.down", primary: false) {
                    Task { await saveToPhotos() }
                }
                .disabled(saving || job?.videoURL == nil)

                actionButton(label: "Share", system: "square.and.arrow.up", primary: false) {
                    showShare = true
                }
                .disabled(job?.videoURL == nil)

                actionButton(label: "Make full ad", system: "wand.and.stars", primary: true) {
                    chatVM.useCreatorForFullAd()
                }
                .disabled(chatVM.isPromotingCreator)
            }

            Button(action: { chatVM.newConversation() }) {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .bold))
                    Text("Start a new chat")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(.white.opacity(0.75))
                .padding(.top, 2)
                .frame(maxWidth: .infinity)
            }

            if let msg = saveMessage {
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
            }
        }
        .sheet(isPresented: $showShare) {
            if let urlString = chatVM.activeCreatorJob?.videoURL, let url = URL(string: urlString) {
                UGCShareSheet(items: [url])
            }
        }
    }

    private func actionButton(label: String, system: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                if saving && label == "Save" {
                    ProgressView().tint(.white).frame(height: 18)
                } else {
                    Image(systemName: system)
                        .font(.system(size: 15, weight: .heavy))
                }
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(primary
                          ? AnyShapeStyle(AppConstants.accentGradient)
                          : AnyShapeStyle(Color.white.opacity(0.1)))
            )
        }
    }

    private func saveToPhotos() async {
        guard let urlString = chatVM.activeCreatorJob?.videoURL,
              let url = URL(string: urlString) else { return }
        saving = true
        defer { saving = false }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("creator-\(chatVM.activeCreatorJob?.id ?? UUID().uuidString).mp4")
            try data.write(to: tmp)
            try await UGCPhotoSaver.saveVideo(at: tmp)
            saveMessage = "Saved to Photos."
        } catch {
            saveMessage = "Couldn't save: \(error.localizedDescription)"
        }
    }
}

// MARK: - Template picker

/// Horizontally-paged carousel of the curated 6 templates. Each card is a
/// looping muted video preview so the user can feel the creator's energy
/// before committing.
struct UGCChatTemplatePickerCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Pick your creator")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundColor(.white)
                Text("Each one becomes the on-camera presenter for your ad.")
                    .font(.system(size: 13))
                    .foregroundColor(AppConstants.textSecondary)
            }

            if chatVM.isLoadingTemplates && chatVM.templates.isEmpty {
                HStack { Spacer(); ProgressView().tint(.white).padding(.vertical, 32); Spacer() }
            } else if chatVM.templates.isEmpty {
                Text(chatVM.templatesError ?? "No templates available right now.")
                    .font(.system(size: 13))
                    .foregroundColor(AppConstants.textSecondary)
                    .padding(.vertical, 12)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(chatVM.templates) { template in
                            TemplatePickItem(
                                template: template,
                                isSelected: chatVM.pickedTemplate?.id == template.id,
                                onTap: { chatVM.pickTemplate(template) }
                            )
                        }
                    }
                    .padding(.vertical, 4)
                }
                .scrollTargetBehavior(.viewAligned)
            }
        }
    }
}

private struct TemplatePickItem: View {
    let template: UGCTemplate
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let url = URL(string: template.videoURL) {
                        LoopingVideoView(url: url, isActive: true, muted: true, aspectFill: true)
                    } else {
                        AsyncImage(url: URL(string: template.thumbnailURL)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.black
                        }
                    }
                }
                .frame(width: 180, height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                // Bottom gradient for legibility
                LinearGradient(
                    colors: [.clear, .black.opacity(0.75)],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 110)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 3) {
                    Text(template.actorName)
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundColor(.white)
                    Text(template.name)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                .padding(12)
            }
            .frame(width: 180, height: 280)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(
                        isSelected ? AnyShapeStyle(AppConstants.accentGradient)
                                   : AnyShapeStyle(Color.white.opacity(0.08)),
                        lineWidth: isSelected ? 2.4 : 1
                    )
            )
            .shadow(color: isSelected ? Color.purple.opacity(0.5) : .clear, radius: 16, y: 6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Template summary (collapsed)

struct UGCChatTemplateSummaryCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let template: UGCTemplate

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                if let url = URL(string: template.thumbnailURL) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Color.black }
                }
            }
            .frame(width: 54, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text("Creator")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                Text(template.actorName)
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundColor(.white)
                Text(template.name)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.75))
                    .lineLimit(1)
            }

            Spacer()

            Button {
                chatVM.revisit(.templatePicker)
            } label: {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
        }
    }
}

// MARK: - Product entry card

struct UGCChatProductCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Tell me about your product")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundColor(.white)
                Text("Whatever \(chatVM.pickedTemplate?.actorName ?? "the creator") is going to talk about.")
                    .font(.system(size: 13))
                    .foregroundColor(AppConstants.textSecondary)
            }

            HStack(alignment: .top, spacing: 12) {
                ProductPhotoPickerSection()
                VStack(spacing: 10) {
                    inputField(
                        label: "Product name",
                        text: $chatVM.productName,
                        placeholder: "e.g. GlowOil Vitamin C Serum"
                    )
                    inputField(
                        label: "Brand tone (optional)",
                        text: $chatVM.productTone,
                        placeholder: "e.g. playful, premium, gen-z"
                    )
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("What it does")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                ZStack(alignment: .topLeading) {
                    if chatVM.productDescription.isEmpty {
                        Text("e.g. brightens skin in 7 days, vegan, no fragrance, $24…")
                            .font(.system(size: 14))
                            .foregroundColor(AppConstants.chatPlaceholder)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $chatVM.productDescription)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 90)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .foregroundColor(.white)
                }
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(AppConstants.chatComposerInner)
                )
            }

            Button {
                chatVM.submitProduct()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 13, weight: .heavy))
                    Text("Continue to script")
                        .font(.system(size: 15, weight: .heavy))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(chatVM.canSubmitProduct
                              ? AnyShapeStyle(AppConstants.accentGradient)
                              : AnyShapeStyle(Color.white.opacity(0.1)))
                )
            }
            .disabled(!chatVM.canSubmitProduct)
        }
    }

    private func inputField(label: String, text: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(AppConstants.textSecondary)
            TextField("", text: text, prompt: Text(placeholder).foregroundColor(AppConstants.chatPlaceholder))
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(AppConstants.chatComposerInner)
                )
        }
    }
}

/// Wraps the photo picker in its own SwiftUI view so the picker's label
/// closure inherits a properly main-actor-isolated body (rather than the
/// caller's outer `body` closure, which strict concurrency considers
/// `@Sendable` and therefore cannot touch `@MainActor` view-model state).
private struct ProductPhotoPickerSection: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        // Pulling the @MainActor-isolated properties into local lets up here
        // keeps the PhotosPicker label closure from getting flagged as a
        // Sendable closure under strict concurrency.
        let image = chatVM.productImage
        let urlString = chatVM.productImageURL
        return PhotosPicker(selection: $chatVM.productPhotoItem, matching: .images) {
            ProductPhotoPickerThumb(image: image, urlString: urlString)
        }
        .onChange(of: chatVM.productPhotoItem) { _, _ in
            Task { await chatVM.loadProductPhoto() }
        }
    }
}

/// Tiny inert thumbnail used as the PhotosPicker label. Pulling this out of
/// the picker's main-actor-confused closure silences strict concurrency
/// warnings about `@MainActor` property access.
private struct ProductPhotoPickerThumb: View {
    let image: UIImage?
    let urlString: String?

    var body: some View {
        ZStack {
            if let img = image {
                Image(uiImage: img).resizable().scaledToFill()
            } else if let urlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Color.black }
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 22))
                        .foregroundColor(.white.opacity(0.85))
                    Text("Photo")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.75))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(AppConstants.chatComposerInner)
            }
        }
        .frame(width: 92, height: 92)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(.white.opacity(0.08), lineWidth: 1)
        )
    }
}

// MARK: - Product summary (collapsed)

struct UGCChatProductSummaryCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Group {
                if let img = chatVM.productImage {
                    Image(uiImage: img).resizable().scaledToFill()
                } else if let urlString = chatVM.productImageURL, let url = URL(string: urlString) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { Color.black }
                } else {
                    ZStack {
                        AppConstants.chatComposerInner
                        Image(systemName: "bag")
                            .font(.system(size: 18))
                            .foregroundColor(.white.opacity(0.55))
                    }
                }
            }
            .frame(width: 52, height: 52)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text("Product")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                Text(chatVM.productName.isEmpty ? "—" : chatVM.productName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                if !chatVM.productDescription.isEmpty {
                    Text(chatVM.productDescription)
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(2)
                }
            }

            Spacer()

            Button {
                chatVM.revisit(.productEntry)
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
        }
    }
}

// MARK: - Script card

struct UGCChatScriptCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Co-write the script")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundColor(.white)
                    Text("Edit anything you'd like — or hit regenerate.")
                        .font(.system(size: 13))
                        .foregroundColor(AppConstants.textSecondary)
                }
                Spacer()
                regenerateButton
            }

            scriptEditor

            if let err = chatVM.scriptError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }

            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                    .font(.system(size: 11))
                Text(targetCopy)
                    .font(.system(size: 12))
            }
            .foregroundColor(AppConstants.textSecondary)

            Button {
                chatVM.approveScript()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .heavy))
                    Text("Looks good · continue")
                        .font(.system(size: 15, weight: .heavy))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(chatVM.canApproveScript
                              ? AnyShapeStyle(AppConstants.accentGradient)
                              : AnyShapeStyle(Color.white.opacity(0.1)))
                )
            }
            .disabled(!chatVM.canApproveScript)
        }
    }

    private var regenerateButton: some View {
        Button {
            Task { await chatVM.generateScript() }
        } label: {
            HStack(spacing: 6) {
                if chatVM.isGeneratingScript {
                    ProgressView().scaleEffect(0.7).tint(.white)
                } else {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 12, weight: .bold))
                }
                Text(chatVM.script.isEmpty ? "Write with AI" : "Regenerate")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Capsule().fill(Color.white.opacity(0.12)))
        }
        .disabled(chatVM.isGeneratingScript || !chatVM.canSubmitProduct)
        .opacity(chatVM.canSubmitProduct ? 1 : 0.5)
    }

    private var scriptEditor: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(AppConstants.chatComposerInner)

            if chatVM.script.isEmpty && !chatVM.isGeneratingScript {
                Text("Tap \"Write with AI\" — or just type the spoken script yourself.")
                    .font(.system(size: 14))
                    .foregroundColor(AppConstants.chatPlaceholder)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 18)
                    .allowsHitTesting(false)
            }

            if chatVM.isGeneratingScript && chatVM.script.isEmpty {
                HStack(spacing: 10) {
                    ProgressView().tint(.white).scaleEffect(0.85)
                    Text("Drafting your script…")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.9))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
            }

            TextEditor(text: $chatVM.script)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 160)
                .padding(10)
                .foregroundColor(.white)
        }
    }

    private var targetCopy: String {
        let seconds = chatVM.pickedTemplate?.durationSeconds ?? 12
        let words = max(20, Int(Double(seconds) * 2.4))
        return "Aim for ~\(seconds)s spoken (\(words) words)."
    }
}

// MARK: - Script summary (collapsed)

struct UGCChatScriptSummaryCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Script")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                Spacer()
                Button {
                    chatVM.revisit(.scriptDraft)
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(Color.white.opacity(0.1)))
                }
            }
            Text(chatVM.script)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
                .lineLimit(5)
        }
    }
}

// MARK: - Voice picker

struct UGCChatVoiceCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Pick a voice")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundColor(.white)
                Text("How \(chatVM.pickedTemplate?.actorName ?? "your creator") sounds. ElevenLabs powered.")
                    .font(.system(size: 13))
                    .foregroundColor(AppConstants.textSecondary)
            }

            let groups = groupedVoices(chatVM.voices)
            ForEach(groups.keys.sorted(), id: \.self) { genderKey in
                VStack(alignment: .leading, spacing: 8) {
                    Text(genderKey.capitalized)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(AppConstants.textSecondary)
                    FlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(groups[genderKey] ?? []) { voice in
                            VoiceChip(
                                voice: voice,
                                isSelected: chatVM.selectedVoiceId == voice.id,
                                onTap: { chatVM.selectedVoiceId = voice.id }
                            )
                        }
                    }
                }
            }

            if let err = chatVM.submitError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundColor(.red)
            }

            Button {
                chatVM.approveVoice()
            } label: {
                HStack(spacing: 10) {
                    if chatVM.isSubmittingJob {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 14, weight: .heavy))
                    }
                    Text(chatVM.isSubmittingJob ? "Starting…" : "Generate the video")
                        .font(.system(size: 16, weight: .heavy))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(AppConstants.accentGradient)
                )
            }
            .disabled(chatVM.isSubmittingJob)
        }
    }

    private func groupedVoices(_ voices: [UGCVoicePreset]) -> [String: [UGCVoicePreset]] {
        var grouped: [String: [UGCVoicePreset]] = [:]
        for v in voices {
            grouped[v.gender.lowercased(), default: []].append(v)
        }
        return grouped
    }
}

private struct VoiceChip: View {
    let voice: UGCVoicePreset
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(voice.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isSelected ? .black : .white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(
                    Capsule().fill(isSelected ? Color.white : AppConstants.chatComposerInner)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Voice summary (collapsed)

struct UGCChatVoiceSummaryCard: View {
    @EnvironmentObject var chatVM: ChatViewModel

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(AppConstants.accentGradient)
                    .frame(width: 36, height: 36)
                Image(systemName: "waveform")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Voice")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppConstants.textSecondary)
                Text(displayLabel)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
            }
            Spacer()
            Button {
                chatVM.revisit(.voicePicker)
            } label: {
                Image(systemName: "pencil")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
        }
    }

    private var displayLabel: String {
        if let voice = chatVM.voices.first(where: { $0.id == chatVM.selectedVoiceId }) {
            return voice.label
        }
        return chatVM.selectedVoiceId
    }
}

// MARK: - Generating card

struct UGCChatGeneratingCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var pulse = false

    var body: some View {
        let job = chatVM.activeJob
        let progress = Double(job?.progress ?? 0) / 100.0
        let status = job?.status.displayLabel ?? "Queued"

        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                templatePoster
                    .frame(width: 88, height: 132)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    )
                    .scaleEffect(pulse ? 1.0 : 0.97)
                    .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: pulse)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Cooking your UGC ad…")
                        .font(.system(size: 17, weight: .heavy))
                        .foregroundColor(.white)
                    Text("ElevenLabs is voicing the script, then Kling lip-syncs it onto \(chatVM.pickedTemplate?.actorName ?? "your creator").")
                        .font(.system(size: 12))
                        .foregroundColor(AppConstants.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }

            ProgressView(value: progress)
                .progressViewStyle(LinearProgressViewStyle())
                .tint(.white)
                .frame(height: 6)

            HStack {
                HStack(spacing: 6) {
                    Circle().fill(Color.green).frame(width: 8, height: 8)
                    Text(status)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                }
                Spacer()
                Text("\(job?.progress ?? 0)%")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
            }

            if let err = job?.error, job?.status == .failed {
                VStack(alignment: .leading, spacing: 10) {
                    Text(err)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                    Button {
                        chatVM.revisit(.voicePicker)
                    } label: {
                        Text("Try again")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color.white.opacity(0.12)))
                    }
                }
            } else {
                Text("This usually takes 30–90 seconds. You can keep this screen open or check back in My Videos.")
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
            }
        }
        .onAppear { pulse = true }
    }

    @ViewBuilder
    private var templatePoster: some View {
        if let urlString = chatVM.pickedTemplate?.thumbnailURL,
           let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFill()
            } placeholder: { Color.black }
        } else {
            Color.black
        }
    }
}

// MARK: - Complete card (final result)

struct UGCChatResultCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @State private var player: AVPlayer?
    @State private var saving = false
    @State private var saveMessage: String?
    @State private var showShare = false

    var body: some View {
        let job = chatVM.activeJob
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(AppConstants.accentGradient)
                Text("Your UGC ad is ready")
                    .font(.system(size: 19, weight: .heavy))
                    .foregroundColor(.white)
                Spacer()
            }

            ZStack {
                Color.black
                if let player {
                    VideoPlayer(player: player)
                } else if let urlString = job?.outputVideoURL,
                          let url = URL(string: urlString) {
                    Color.clear.onAppear {
                        player = AVPlayer(url: url)
                        player?.play()
                    }
                }
            }
            .aspectRatio(9.0/16.0, contentMode: .fit)
            .frame(maxWidth: 280)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )

            HStack(spacing: 10) {
                actionButton(label: "Save", system: "square.and.arrow.down", primary: false) {
                    Task { await saveToPhotos() }
                }
                .disabled(saving || job?.outputVideoURL == nil)

                actionButton(label: "Share", system: "square.and.arrow.up", primary: false) {
                    showShare = true
                }
                .disabled(job?.outputVideoURL == nil)

                actionButton(label: "Make another", system: "sparkles", primary: true) {
                    chatVM.newConversation()
                }
            }

            if let msg = saveMessage {
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(AppConstants.textSecondary)
            }
        }
        .sheet(isPresented: $showShare) {
            if let url = job?.outputVideoURL.flatMap(URL.init(string:)) {
                UGCShareSheet(items: [url])
            }
        }
        .onChange(of: chatVM.activeJob?.outputVideoURL) { _, newURL in
            if let newURL, let url = URL(string: newURL), player == nil {
                player = AVPlayer(url: url)
                player?.play()
            }
        }
    }

    private func actionButton(label: String, system: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                if saving && label == "Save" {
                    ProgressView().tint(.white).frame(height: 18)
                } else {
                    Image(systemName: system)
                        .font(.system(size: 15, weight: .heavy))
                }
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(primary
                          ? AnyShapeStyle(AppConstants.accentGradient)
                          : AnyShapeStyle(Color.white.opacity(0.1)))
            )
        }
    }

    private func saveToPhotos() async {
        guard let urlString = chatVM.activeJob?.outputVideoURL,
              let url = URL(string: urlString) else { return }
        saving = true
        defer { saving = false }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(chatVM.activeJob?.id ?? UUID().uuidString).mp4")
            try data.write(to: tmp)
            try await UGCPhotoSaver.saveVideo(at: tmp)
            saveMessage = "Saved to Photos."
        } catch {
            saveMessage = "Couldn't save: \(error.localizedDescription)"
        }
    }
}

private struct UGCShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private enum UGCPhotoSaver {
    static func saveVideo(at url: URL) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw NSError(domain: "PhotoSaver", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Photos access denied"
            ])
        }
        try await PHPhotoLibrary.shared().performChanges {
            let req = PHAssetCreationRequest.forAsset()
            req.addResource(with: .video, fileURL: url, options: nil)
        }
    }
}

// MARK: - Flow layout helper

/// Lightweight flexible-wrap layout used by the voice chips. Native
/// `FlowLayout` exists from iOS 17 but the call site here is small enough
/// that a custom implementation keeps deployment compatibility predictable.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth, x > bounds.minX {
                x = bounds.minX
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            s.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
