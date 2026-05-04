import SwiftUI

private enum AssistantMarkdown {
    /// Rich text for assistant replies; tolerates incomplete Markdown while streaming.
    static func attributed(_ source: String) -> AttributedString {
        guard !source.isEmpty else { return AttributedString() }
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .full
        options.failurePolicy = .returnPartiallyParsedIfPossible
        do {
            return try AttributedString(markdown: source, options: options)
        } catch {
            return AttributedString(source)
        }
    }
}

private struct AssistantMarkdownText: View {
    let content: String

    var body: some View {
        Text(AssistantMarkdown.attributed(content))
            .font(.system(size: 16))
            .lineSpacing(7)
            .multilineTextAlignment(.leading)
            .foregroundStyle(AppConstants.textPrimary)
            .tint(Color(red: 0.58, green: 0.72, blue: 1.0))
            .textSelection(.enabled)
    }
}

struct MessageBubble: View {
    let message: Message
    var localImages: [UIImage]? = nil
    var onAnswerQuestions: ((_ messageId: String, _ payload: QuestionsPayload, _ answers: [String: [String]]) -> Void)? = nil
    var onSkipQuestions: ((_ messageId: String) -> Void)? = nil

    private var isUser: Bool { message.role == .user }

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
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(imageURLs, id: \.self) { url in
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
                        }
                    }
                }

                if !message.content.isEmpty {
                    Group {
                        if isUser {
                            Text(message.content)
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
struct StreamingBubble: View {
    let text: String

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if text.isEmpty {
                InlineTypingDots()
                    .padding(.vertical, 10)
            } else {
                Text(AssistantMarkdown.attributed(text))
                    .font(.system(size: 16))
                    .lineSpacing(7)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(AppConstants.textPrimary)
                    .tint(Color(red: 0.58, green: 0.72, blue: 1.0))
                    .padding(.vertical, 8)
                    .animation(nil, value: text)
            }

            Spacer(minLength: 60)
        }
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
