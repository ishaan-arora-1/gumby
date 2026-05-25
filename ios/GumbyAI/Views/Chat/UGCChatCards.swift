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

// MARK: - Welcome landing

/// The "Create UGC" landing body — rendered directly on the chat background
/// image (no card surface around it). It owns the horizontal template
/// carousel and the suggested-prompt pills; the composer at the bottom of
/// the screen is a separate sibling view (`UGCChatComposerBar`).
struct UGCChatWelcomeBody: View {
    @EnvironmentObject var chatVM: ChatViewModel

    /// Suggested prompts. We surface the first three by default and expand
    /// to the full list when the user taps "see all".
    private let promptIdeas: [String] = [
        "Early 20s girl in a sunlit bedroom holding up a beige hoodie, casual get-ready-with-me energy.",
        "Late 20s guy at a gym mirror, post-workout, talking about a new protein bar.",
        "Mid 20s creator in a soft pink bathroom holding a glass serum bottle, dewy lighting.",
        "College-age girl unboxing a small jewellery box at her desk, golden hour light.",
        "Cozy living room storytime, soft fairy lights, holding up a candle.",
        "Vanity mirror lipgloss close-up, warm ring-light glow.",
    ]

    @State private var showAllPrompts: Bool = false

    var body: some View {
        VStack(spacing: 22) {
            feedToggle
            feedCarousel
            promptList
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
    }

    // MARK: - Templates / Library toggle

    private var feedToggle: some View {
        HStack(spacing: 8) {
            ForEach(ChatViewModel.WelcomeFeed.allCases, id: \.self) { feed in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        chatVM.welcomeFeed = feed
                    }
                    if feed == .library {
                        Task { await chatVM.loadLibrary(force: false) }
                    } else {
                        Task { await chatVM.ensureTemplatesLoaded() }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(feed.rawValue)
                            .font(.system(size: 13.5, weight: .heavy))
                        if feed == .library && !chatVM.library.isEmpty {
                            Text("\(chatVM.library.count)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(chatVM.welcomeFeed == feed ? .black.opacity(0.65) : .white.opacity(0.65))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(
                                    Capsule().fill(chatVM.welcomeFeed == feed
                                                   ? Color.black.opacity(0.10)
                                                   : Color.white.opacity(0.20))
                                )
                        }
                    }
                    .foregroundColor(chatVM.welcomeFeed == feed ? .black : .white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(chatVM.welcomeFeed == feed
                                       ? Color.white
                                       : Color.white.opacity(0.16))
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Carousel (templates or library)

    @ViewBuilder
    private var feedCarousel: some View {
        switch chatVM.welcomeFeed {
        case .templates:
            templatesCarousel
        case .library:
            libraryCarousel
        }
    }

    private var templatesCarousel: some View {
        VStack(alignment: .leading, spacing: 0) {
            if chatVM.isLoadingTemplates && chatVM.templates.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().tint(.white).padding(.vertical, 60)
                    Spacer()
                }
            } else if chatVM.templates.isEmpty {
                emptyTemplateState
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(chatVM.templates) { tpl in
                            LandingTemplateCard(template: tpl) {
                                chatVM.pickTemplate(tpl)
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 4)
                }
                .scrollTargetBehavior(.viewAligned)
            }
        }
        .task { await chatVM.ensureTemplatesLoaded() }
    }

    private var libraryCarousel: some View {
        VStack(alignment: .leading, spacing: 0) {
            if chatVM.isLoadingLibrary && chatVM.library.isEmpty {
                HStack {
                    Spacer()
                    ProgressView().tint(.white).padding(.vertical, 60)
                    Spacer()
                }
            } else if chatVM.library.isEmpty {
                emptyLibraryState
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(chatVM.library) { creator in
                            LandingLibraryCard(creator: creator) {
                                chatVM.useLibraryItem(creator)
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 4)
                }
                .scrollTargetBehavior(.viewAligned)
            }
        }
        .task { await chatVM.loadLibrary(force: false) }
    }

    private var emptyLibraryState: some View {
        VStack(spacing: 10) {
            Image(systemName: "books.vertical")
                .font(.system(size: 28, weight: .heavy))
                .foregroundColor(.white.opacity(0.85))
            Text(chatVM.libraryError ?? "Your generated creators will show up here.")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.85))
                .multilineTextAlignment(.center)
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    chatVM.welcomeFeed = .templates
                }
            } label: {
                Text("Browse templates →")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color.white.opacity(0.18)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 18)
    }

    private var emptyTemplateState: some View {
        VStack(spacing: 10) {
            Text(chatVM.templatesError ?? "Loading creators…")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
            Button {
                Task { await chatVM.loadTemplates(force: true) }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .heavy))
                    Text("Retry")
                        .font(.system(size: 13, weight: .heavy))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule().fill(Color.white.opacity(0.15)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 18)
    }

    // MARK: - Prompt list

    private var promptList: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(visiblePrompts.enumerated()), id: \.offset) { _, idea in
                    PromptPill(text: idea) {
                        chatVM.composerPrompt = idea
                    }
                }
            }

            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    showAllPrompts.toggle()
                }
            } label: {
                Text(showAllPrompts ? "see less" : "see all….")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.92))
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 4)
        }
        .padding(.horizontal, 18)
    }

    private var visiblePrompts: [String] {
        showAllPrompts ? promptIdeas : Array(promptIdeas.prefix(3))
    }
}

// MARK: - Landing template card

/// Large 9:16-ish autoplaying preview used in the welcome carousel. Each
/// card streams its own muted, looping video so the landing feels alive. We
/// fall back to the poster image while the video is still resolving (or if
/// the URL is malformed).
private struct LandingTemplateCard: View {
    let template: UGCTemplate
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
                            Color.white.opacity(0.85)
                        }
                    }
                }
                .frame(width: 188, height: 264)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))

                LinearGradient(
                    colors: [.clear, .black.opacity(0.55)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                .frame(height: 110)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 2) {
                    Text(template.actorName)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(.white)
                    Text(template.name)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                .padding(14)
            }
            .frame(width: 188, height: 264)
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.30), radius: 14, y: 6)
        }
        .buttonStyle(.plain)
    }
}

/// Library tile = a user-generated creator clip. Visually mirrors
/// `LandingTemplateCard` but labels itself as "Your creator" and shows a
/// short prompt preview so users can tell their library entries apart.
private struct LandingLibraryCard: View {
    let creator: UGCCreatorJob
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let videoString = creator.videoURL, let url = URL(string: videoString) {
                        LoopingVideoView(url: url, isActive: true, muted: true, aspectFill: true)
                    } else if let thumbString = creator.thumbnailURL, let thumbURL = URL(string: thumbString) {
                        AsyncImage(url: thumbURL) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color.white.opacity(0.85)
                        }
                    } else {
                        Color.white.opacity(0.12)
                    }
                }
                .frame(width: 188, height: 264)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))

                LinearGradient(
                    colors: [.clear, .black.opacity(0.55)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                .frame(height: 110)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 11, weight: .bold))
                        Text("Your creator")
                            .font(.system(size: 13, weight: .heavy))
                    }
                    .foregroundColor(.white)
                    Text(creator.prompt)
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(1)
                }
                .padding(14)
            }
            .frame(width: 188, height: 264)
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(Color.white.opacity(0.20), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.30), radius: 14, y: 6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Prompt pill

/// Frosted rectangle used for the suggested-prompt rows on the landing.
/// Tapping one drops the text into the composer (does not auto-submit, so the
/// user can tweak before generating).
private struct PromptPill: View {
    let text: String
    let onTap: () -> Void

    private let cornerRadius: CGFloat = 10

    var body: some View {
        Button(action: onTap) {
            Text(text)
                .font(.system(size: 13.5, weight: .regular))
                .foregroundColor(.white)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color.white.opacity(0.18))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
                .background(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(.ultraThinMaterial.opacity(0.4))
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Composer bar (pinned to bottom on the welcome step)

/// The "Ask…" composer pinned to the bottom of the screen on the welcome
/// step. Mirrors the reference mock: leading "+" affordance, free-text
/// prompt input, aspect-ratio chip, mic glyph, and a gradient send button.
struct UGCChatComposerBar: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @FocusState private var promptFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            if let err = chatVM.composerError {
                Text(err)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.red.opacity(0.85)))
                    .padding(.horizontal, 18)
                    .transition(.opacity)
            }
            composerRow
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }

    private var composerRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if chatVM.composerPrompt.isEmpty {
                    Text("Describe your video ad…")
                        .font(.system(size: 16))
                        .foregroundColor(.white.opacity(0.6))
                        .padding(.vertical, 2)
                        .allowsHitTesting(false)
                }
                TextField("", text: $chatVM.composerPrompt, axis: .vertical)
                    .focused($promptFocused)
                    .tint(.white)
                    .foregroundColor(.white)
                    .font(.system(size: 16))
                    .lineLimit(1...5)
                    .submitLabel(.send)
                    .onSubmit { chatVM.submitDirectPrompt() }
            }
            .frame(minHeight: 24, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 10) {
                Button {
                    // Reserved for future "attach product photo" affordance.
                    promptFocused = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)

                Menu {
                    ForEach(["9:16", "1:1", "16:9"], id: \.self) { option in
                        Button(action: { chatVM.composerAspectRatio = option }) {
                            if chatVM.composerAspectRatio == option {
                                Label(option, systemImage: "checkmark")
                            } else {
                                Text(option)
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(chatVM.composerAspectRatio)
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.white)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundColor(.white.opacity(0.85))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.white.opacity(0.16)))
                }

                Spacer(minLength: 0)

                Image(systemName: "mic.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white.opacity(0.85))
                    .frame(width: 32, height: 32)

                Button(action: { chatVM.submitDirectPrompt() }) {
                    ZStack {
                        Circle()
                            .fill(chatVM.canSubmitDirectPrompt && !chatVM.isParsingPrompt
                                  ? AnyShapeStyle(Color.white)
                                  : AnyShapeStyle(Color.white.opacity(0.25)))
                            .frame(width: 36, height: 36)
                        if chatVM.isParsingPrompt {
                            ProgressView()
                                .tint(.black)
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 15, weight: .heavy))
                                .foregroundColor(chatVM.canSubmitDirectPrompt
                                                 ? .black
                                                 : .white.opacity(0.7))
                        }
                    }
                }
                .disabled(!chatVM.canSubmitDirectPrompt || chatVM.isParsingPrompt)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.black.opacity(0.55))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
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
                VStack(spacing: 10) {
                    Text(chatVM.templatesError ?? "No creators loaded yet.")
                        .font(.system(size: 13))
                        .foregroundColor(AppConstants.textSecondary)
                        .multilineTextAlignment(.center)
                    Button {
                        Task { await chatVM.loadTemplates(force: true) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 12, weight: .heavy))
                            Text("Retry")
                                .font(.system(size: 13, weight: .heavy))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
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
        .task {
            // Belt-and-suspenders: even if `openTemplatePicker()` already
            // triggered a reload, re-fire the ensure when the view appears so
            // late auth-completion never leaves us with an empty carousel.
            await chatVM.ensureTemplatesLoaded()
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

/// Hero banner shown at the top of every lip-sync step (product, script,
/// voice, generating, complete). It plays the picked creator's video on
/// loop so the user always sees who they're about to put on camera — the
/// same hero treatment a film set would give an actor headshot.
struct UGCChatTemplateSummaryCard: View {
    @EnvironmentObject var chatVM: ChatViewModel
    let template: UGCTemplate

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                Group {
                    if let url = URL(string: template.videoURL) {
                        LoopingVideoView(url: url, isActive: true, muted: true, aspectFill: true)
                    } else {
                        AsyncImage(url: URL(string: template.thumbnailURL)) { image in
                            image.resizable().scaledToFill()
                        } placeholder: { Color.black }
                    }
                }
                .frame(height: 220)
                .frame(maxWidth: .infinity)
                .clipped()

                LinearGradient(
                    colors: [.clear, .black.opacity(0.65)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                .frame(height: 120)
                .frame(maxWidth: .infinity, alignment: .bottom)
                .allowsHitTesting(false)

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Creator")
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundColor(.white.opacity(0.75))
                            .textCase(.uppercase)
                            .tracking(0.8)
                        Text(template.actorName)
                            .font(.system(size: 18, weight: .heavy))
                            .foregroundColor(.white)
                        Text(template.name)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white.opacity(0.85))
                            .lineLimit(1)
                    }

                    Spacer()

                    Button {
                        chatVM.revisit(.templatePicker)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.uturn.backward")
                                .font(.system(size: 11, weight: .heavy))
                            Text("Change")
                                .font(.system(size: 12, weight: .heavy))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(.ultraThinMaterial))
                    }
                    .buttonStyle(.plain)
                }
                .padding(14)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.30), radius: 14, y: 6)
        }
    }
}


// MARK: - Share / Save helpers (used by the standalone result card)

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
