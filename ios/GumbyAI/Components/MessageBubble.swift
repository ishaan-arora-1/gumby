import SwiftUI

private enum AssistantMarkdown {
    /// Turns single newlines into Markdown hard line breaks (`  \n`) so they aren't folded to spaces during parsing.
    /// Double newlines remain paragraph splits. Also injects blank lines around headings, before/after
    /// bullet lists, and between sentence-paragraphs so models that emit a single dense block still
    /// render with breathing room.
    static func normalizeNewlinesForMarkdown(_ source: String) -> String {
        var s = source.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        // Rare transport bug: literal backslash-n with no real newlines.
        if !s.contains("\n"), s.contains(#"\n"#) {
            s = s.replacingOccurrences(of: #"\r\n"#, with: "\n")
            s = s.replacingOccurrences(of: #"\n"#, with: "\n")
        }

        s = injectStructuralBreaks(s)

        return s
            .components(separatedBy: "\n\n")
            .map { block in
                block.replacingOccurrences(of: "\n", with: "  \n")
            }
            .joined(separator: "\n\n")
    }

    /// Defensive cleanup: when the model returns one dense paragraph, restore visual structure by
    /// inserting blank lines around headings and around bullet/numbered lists.
    private static func injectStructuralBreaks(_ input: String) -> String {
        var s = input

        // Ensure blank line BEFORE Markdown headings (## or ###) if they appear inline.
        if let regex = try? NSRegularExpression(pattern: "(?<!\\n)\\n(#{1,6} )", options: []) {
            let range = NSRange(s.startIndex..., in: s)
            s = regex.stringByReplacingMatches(in: s, range: range, withTemplate: "\n\n$1")
        }

        // Ensure blank line AFTER a heading line (next char is not already a newline).
        if let regex = try? NSRegularExpression(pattern: "(^|\\n)(#{1,6} [^\\n]+)\\n(?!\\n)", options: []) {
            let range = NSRange(s.startIndex..., in: s)
            s = regex.stringByReplacingMatches(in: s, range: range, withTemplate: "$1$2\n\n")
        }

        // Ensure blank line BEFORE a bullet list when an inline sentence runs into "- ".
        if let regex = try? NSRegularExpression(pattern: "([^\\n])\\n(- )", options: []) {
            let range = NSRange(s.startIndex..., in: s)
            s = regex.stringByReplacingMatches(in: s, range: range, withTemplate: "$1\n\n$2")
        }

        // Ensure blank line BEFORE numbered lists ("1. ", "2. ", etc).
        if let regex = try? NSRegularExpression(pattern: "([^\\n])\\n(\\d+\\. )", options: []) {
            let range = NSRange(s.startIndex..., in: s)
            s = regex.stringByReplacingMatches(in: s, range: range, withTemplate: "$1\n\n$2")
        }

        return s
    }

    /// Rich text for assistant replies; tolerates incomplete Markdown while streaming.
    /// Note: Applying `.font` / `.foregroundStyle` on `Text(attributed)` strips inline Markdown styling — keep modifiers off.
    static func attributed(_ source: String) -> AttributedString {
        guard !source.isEmpty else { return AttributedString() }
        let prepared = normalizeNewlinesForMarkdown(source)

        #if canImport(UIKit)
        do {
            let ns = try NSAttributedString(
                markdown: prepared,
                options: .init(
                    allowsExtendedAttributes: true,
                    interpretedSyntax: .full,
                    failurePolicy: .returnPartiallyParsedIfPossible
                )
            )
            return AttributedString(ns)
        } catch {
            // fall through
        }
        #endif

        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .full
        options.failurePolicy = .returnPartiallyParsedIfPossible
        options.allowsExtendedAttributes = true
        do {
            return try AttributedString(markdown: prepared, options: options)
        } catch {
            return AttributedString(prepared)
        }
    }
}

private struct AssistantMarkdownText: View {
    let content: String

    var body: some View {
        Text(AssistantMarkdown.attributed(content))
            .lineSpacing(6)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .tint(Color(red: 0.58, green: 0.72, blue: 1.0))
            .textSelection(.enabled)
            // Important: avoid `.font` / `.foregroundStyle` here—they flatten Markdown runs to one style.
    }
}

struct MessageBubble: View {
    let message: Message
    var localImages: [UIImage]? = nil
    var onAnswerQuestions: ((_ messageId: String, _ payload: QuestionsPayload, _ answers: [String: [String]]) -> Void)? = nil
    var onSkipQuestions: ((_ messageId: String) -> Void)? = nil

    private var isUser: Bool { message.role == .user }

    private static func normalizedUserContent(_ raw: String) -> String {
        raw.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
    }

    var body: some View {
        // Render clarifying-questions card instead of a plain bubble
        if let payload = message.questions {
            HStack(alignment: .top, spacing: 8) {
                QuestionsCard(
                    messageId: message.id,
                    payload: payload,
                    onSubmit: { answers in
                        onAnswerQuestions?(message.id, payload, answers)
                    },
                    onSkip: {
                        onSkipQuestions?(message.id)
                    }
                )
                Spacer(minLength: 20)
            }
        } else {
            bubbleView
        }
    }

    private var bubbleView: some View {
        HStack(alignment: .top, spacing: 8) {
            if isUser { Spacer(minLength: 60) }

            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if let locals = localImages, !locals.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Array(locals.enumerated()), id: \.offset) { _, img in
                                Image(uiImage: img)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 120, height: 120)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(.black.opacity(0.15))
                                    )
                            }
                        }
                    }
                } else if let imageURLs = message.imageURLs, !imageURLs.isEmpty {
                    if isUser {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(imageURLs, id: \.self) { url in
                                    Button {
                                        RemoteImagePreviewController.shared.present(urlString: url)
                                    } label: {
                                        AsyncImage(url: URL(string: url)) { image in
                                            image.resizable().scaledToFill()
                                        } placeholder: {
                                            RoundedRectangle(cornerRadius: 8)
                                                .fill(AppConstants.surfaceColor)
                                                .overlay(ProgressView().tint(.white))
                                        }
                                        .frame(width: 120, height: 120)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(imageURLs, id: \.self) { url in
                                Button {
                                    RemoteImagePreviewController.shared.present(urlString: url)
                                } label: {
                                    AsyncImage(url: URL(string: url)) { phase in
                                        switch phase {
                                        case .empty:
                                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                .fill(AppConstants.chatComposerInner)
                                                .frame(height: 240)
                                                .overlay(ProgressView().tint(.white))
                                        case .success(let image):
                                            image
                                                .resizable()
                                                .scaledToFit()
                                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                        case .failure:
                                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                .fill(AppConstants.chatComposerInner)
                                                .frame(height: 200)
                                                .overlay(
                                                    Image(systemName: "exclamationmark.triangle")
                                                        .foregroundStyle(.white.opacity(0.7))
                                                )
                                        @unknown default:
                                            EmptyView()
                                        }
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                if !message.content.isEmpty {
                    Group {
                        if isUser {
                            Text(Self.normalizedUserContent(message.content))
                                .font(.system(size: 16))
                                .foregroundColor(AppConstants.textPrimary)
                                .multilineTextAlignment(.leading)
                                .padding(14)
                                .background(AppConstants.chatUserBubble)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        } else {
                            AssistantMarkdownText(content: message.content)
                                .padding(.vertical, 8)
                                .padding(.trailing, 16)
                        }
                    }
                }
            }

            if !isUser { Spacer(minLength: 60) }
        }
    }
}

/// Single stable streaming row: avoids swapping views when the first token arrives (no blink).
/// Layout rules matching product spec:
///  • While an image is being generated (status != nil and no image yet), show ONLY the rotating
///    status placeholder — no model text on top.
///  • Once the image arrives, show it. Any conversational follow-up text streams BELOW the image.
///  • For text-only turns, show the text and typing dots as usual.
struct StreamingBubble: View {
    let text: String
    var imageURLs: [String] = []
    var status: String? = nil
    var aspect: ImageAspect = .post

    private var isGeneratingImage: Bool {
        (status != nil) && imageURLs.isEmpty
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 10) {
                if isGeneratingImage {
                    GeneratingImagePlaceholder(aspect: aspect)
                } else {
                    if !imageURLs.isEmpty {
                        GeneratedImagesRow(urls: imageURLs)
                    }

                    if !text.isEmpty {
                        Text(AssistantMarkdown.attributed(text))
                            .lineSpacing(6)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .tint(Color(red: 0.58, green: 0.72, blue: 1.0))
                            .padding(.vertical, 4)
                            .animation(nil, value: text)
                    }

                    if text.isEmpty && imageURLs.isEmpty {
                        InlineTypingDots()
                            .padding(.vertical, 10)
                    }
                }
            }

            Spacer(minLength: 60)
        }
    }
}

private struct GeneratedImagesRow: View {
    let urls: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(urls, id: \.self) { url in
                Button {
                    RemoteImagePreviewController.shared.present(urlString: url)
                } label: {
                    AsyncImage(url: URL(string: url)) { phase in
                        switch phase {
                        case .empty:
                            placeholder
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        case .failure:
                            placeholder.overlay(
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(.white.opacity(0.7))
                            )
                        @unknown default:
                            placeholder
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(AppConstants.chatComposerInner)
            .frame(height: 240)
            .overlay(ProgressView().tint(.white))
    }
}

/// Rotating-phrase placeholder shown while the image is being generated.
/// Phrases breathe between higher and lower opacity to suggest "thinking" — no spinner, no trailing dots.
private struct GeneratingImagePlaceholder: View {
    var aspect: ImageAspect = .post

    private static let phrases: [String] = [
        "thinking",
        "sketching the concept",
        "framing the composition",
        "blocking out shapes",
        "choosing a palette",
        "mixing colors",
        "adding colors",
        "balancing contrast",
        "warming up the highlights",
        "shaping the lighting",
        "thinking of aesthetic",
        "exploring the mood",
        "tuning the atmosphere",
        "setting the scene",
        "placing the subject",
        "refining edges",
        "smoothing textures",
        "polishing details",
        "adding visual components",
        "layering depth",
        "fine-tuning typography",
        "aligning the layout",
        "making it aesthetic",
        "making it clean",
        "lifting the shadows",
        "adding finishing touches",
        "calibrating color",
        "almost there"
    ]

    @State private var phraseIndex = 0
    @State private var breathe = false
    @State private var shimmer = false

    private let phraseTimer = Timer.publish(every: 1.8, on: .main, in: .common).autoconnect()

    private var aspectRatio: CGFloat {
        switch aspect {
        case .post: return 1.0
        case .story: return 9.0 / 16.0
        }
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.10, green: 0.10, blue: 0.13),
                            Color(red: 0.16, green: 0.13, blue: 0.22)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.07), lineWidth: 1)
                )

            LinearGradient(
                colors: [
                    Color.white.opacity(0.0),
                    Color.white.opacity(0.08),
                    Color.white.opacity(0.0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .blendMode(.overlay)
            .mask(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .offset(x: shimmer ? 260 : -260)
            .animation(.linear(duration: 2.4).repeatForever(autoreverses: false), value: shimmer)

            Text(currentPhrase)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(AppConstants.textPrimary)
                .opacity(breathe ? 0.95 : 0.32)
                .padding(.horizontal, 20)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .animation(
                    .easeInOut(duration: 1.6).repeatForever(autoreverses: true),
                    value: breathe
                )
                .id(phraseIndex)
                .transition(.opacity)
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(aspectRatio, contentMode: .fit)
        .onAppear {
            shimmer = true
            breathe = true
        }
        .onReceive(phraseTimer) { _ in
            withAnimation(.easeInOut(duration: 0.4)) {
                phraseIndex = (phraseIndex + 1) % Self.phrases.count
            }
        }
    }

    private var currentPhrase: String {
        Self.phrases[phraseIndex % Self.phrases.count]
    }
}

private struct InlineTypingDots: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(AppConstants.chatMutedLabel)
                    .frame(width: 8, height: 8)
                    .scaleEffect(animating ? 1.0 : 0.55)
                    .opacity(animating ? 1.0 : 0.38)
                    .animation(
                        .easeInOut(duration: 0.55)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.18),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
    }
}

struct TypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(AppConstants.chatMutedLabel)
                        .frame(width: 8, height: 8)
                        .scaleEffect(animating ? 1.0 : 0.5)
                        .opacity(animating ? 1.0 : 0.35)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever()
                                .delay(Double(index) * 0.2),
                            value: animating
                        )
                }
            }

            Spacer(minLength: 60)
        }
        .onAppear { animating = true }
    }
}

struct ErrorBubble: View {
    let message: String
    let canRetry: Bool
    let onRetry: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text(message)
                        .font(.subheadline)
                        .foregroundColor(AppConstants.textSecondary)
                        .lineLimit(3)
                }

                if canRetry {
                    Button(action: onRetry) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.clockwise")
                            Text("Retry")
                        }
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(AppConstants.surfaceColor)
                        .clipShape(Capsule())
                    }
                }
            }
            Spacer()
        }
        .padding(12)
        .background(Color.red.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct UploadingIndicator: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .tint(.white)
                .scaleEffect(0.8)
            Text("Uploading images...")
                .font(.subheadline)
                .foregroundColor(AppConstants.textSecondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(AppConstants.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
