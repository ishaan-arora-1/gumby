import SwiftUI

struct QuestionsCard: View {
    let messageId: String
    let payload: QuestionsPayload
    let onSubmit: (_ answers: [String: [String]]) -> Void
    let onSkip: () -> Void

    @State private var currentIndex: Int = 0
    @State private var answers: [String: Set<String>] = [:]
    @State private var otherText: [String: String] = [:]
    @State private var submitted: Bool = false

    private var currentQuestion: ClarifyingQuestion {
        payload.questions[currentIndex]
    }

    /// Hide literal "Other" chips; custom answers use the text field + Send.
    private var displayedOptions: [QuestionOption] {
        currentQuestion.options.filter {
            $0.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "other"
        }
    }

    private var isLast: Bool {
        currentIndex == payload.questions.count - 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !payload.intro.isEmpty {
                Text(payload.intro)
                    .font(.body)
                    .foregroundColor(AppConstants.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
            }

            if submitted {
                summaryView
            } else {
                interactiveView
            }
        }
        .background(AppConstants.chatComposerInner)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AppConstants.chatMutedLabel.opacity(0.18), lineWidth: 1)
        )
    }

    // MARK: - Interactive (not yet submitted)

    private var interactiveView: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider().background(AppConstants.chatMutedLabel.opacity(0.12))

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(currentQuestion.prompt)
                        .font(.headline)
                        .foregroundColor(AppConstants.textPrimary)
                    Spacer()
                    Text("Pick one")
                        .font(.caption)
                        .foregroundColor(AppConstants.chatMutedLabel)
                }

                VStack(spacing: 8) {
                    ForEach(displayedOptions) { option in
                        optionRow(option)
                    }
                    otherRow
                }
            }
            .padding(14)

            Divider().background(AppConstants.chatMutedLabel.opacity(0.12))

            footer
        }
    }

    private var header: some View {
        HStack {
            Text("Questions")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(AppConstants.textPrimary)
            Spacer()
            Text("\(currentIndex + 1) / \(payload.questions.count)")
                .font(.caption)
                .foregroundColor(AppConstants.chatMutedLabel)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private func optionRow(_ option: QuestionOption) -> some View {
        let qid = currentQuestion.id
        let selected = answers[qid]?.contains(option.label) == true

        return Button(action: { handleOptionTap(optionLabel: option.label) }) {
            HStack(alignment: .top, spacing: 12) {
                selectionIndicator(isSelected: selected)

                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(AppConstants.textPrimary)
                    if let desc = option.description, !desc.isEmpty {
                        Text(desc)
                            .font(.caption)
                            .foregroundColor(AppConstants.chatMutedLabel)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(selected ? AppConstants.chatElevatedSurface : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var otherRow: some View {
        let qid = currentQuestion.id
        let draft = otherText[qid] ?? ""
        let sendEnabled = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        return VStack(alignment: .leading, spacing: 8) {
            Text("Or type your own")
                .font(.caption)
                .foregroundColor(AppConstants.chatMutedLabel)

            HStack(spacing: 10) {
                TextField("Your answer", text: Binding(
                    get: { otherText[qid] ?? "" },
                    set: { otherText[qid] = $0 }
                ))
                .font(.subheadline)
                .foregroundColor(AppConstants.textPrimary)
                .textFieldStyle(.plain)

                Button(action: { submitTypedOther() }) {
                    Text("Send")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(sendEnabled ? .white : AppConstants.chatMutedLabel.opacity(0.45))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(AppConstants.chatElevatedSurface.opacity(sendEnabled ? 1 : 0.5))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .disabled(!sendEnabled)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(AppConstants.chatMutedLabel.opacity(0.28), lineWidth: 1)
            )
        }
    }

    private func selectionIndicator(isSelected: Bool) -> some View {
        Circle()
            .stroke(isSelected ? Color.white : AppConstants.chatMutedLabel, lineWidth: 1.5)
            .frame(width: 18, height: 18)
            .overlay(
                Circle()
                    .fill(Color.white)
                    .frame(width: 10, height: 10)
                    .opacity(isSelected ? 1 : 0)
            )
            .padding(.top, 2)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button(action: previous) {
                Image(systemName: "chevron.left")
                    .font(.subheadline)
                    .foregroundColor(currentIndex == 0 ? AppConstants.chatMutedLabel.opacity(0.4) : AppConstants.textPrimary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(AppConstants.chatElevatedSurface))
            }
            .disabled(currentIndex == 0)

            Button(action: next) {
                Image(systemName: "chevron.right")
                    .font(.subheadline)
                    .foregroundColor(isLast ? AppConstants.chatMutedLabel.opacity(0.4) : AppConstants.textPrimary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(AppConstants.chatElevatedSurface))
            }
            .disabled(isLast)

            Spacer()

            Button(action: skipAll) {
                Text("Skip all")
                    .font(.subheadline)
                    .foregroundColor(AppConstants.chatMutedLabel)
            }

            Button(action: nextOrSubmit) {
                Text(isLast ? "Submit" : "Next")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(AppConstants.chatElevatedSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: - Submitted state

    private var summaryView: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(payload.questions) { q in
                let picks = collectAnswers()[q.id] ?? []
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(AppConstants.accentGradient)
                        .font(.subheadline)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(q.prompt)
                            .font(.caption)
                            .foregroundColor(AppConstants.chatMutedLabel)
                        Text(picks.isEmpty ? "(skipped)" : picks.joined(separator: ", "))
                            .font(.subheadline)
                            .foregroundColor(AppConstants.textPrimary)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(14)
    }

    // MARK: - Actions

    /// Choosing an option clears any typed custom answer and advances (except on the last step — Submit sends the full questionnaire).
    private func handleOptionTap(optionLabel label: String) {
        toggleSingle(optionLabel: label)
        if !isLast {
            withAnimation { currentIndex += 1 }
        }
    }

    private func toggleSingle(optionLabel label: String) {
        let qid = currentQuestion.id
        otherText[qid] = ""
        var current = answers[qid] ?? []
        if current.contains(label) {
            current.removeAll()
        } else {
            current = [label]
        }
        answers[qid] = current
    }

    /// Custom answer: clears preset picks, saves text, advances like a chip tap (final questionnaire still uses Submit).
    private func submitTypedOther() {
        let qid = currentQuestion.id
        let trimmed = (otherText[qid] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        answers[qid] = []
        otherText[qid] = trimmed
        if !isLast {
            withAnimation { currentIndex += 1 }
        }
    }

    private func previous() {
        if currentIndex > 0 {
            withAnimation { currentIndex -= 1 }
        }
    }

    private func next() {
        if !isLast {
            withAnimation { currentIndex += 1 }
        }
    }

    private func nextOrSubmit() {
        if isLast {
            submitted = true
            onSubmit(collectAnswers())
        } else {
            withAnimation { currentIndex += 1 }
        }
    }

    private func skipAll() {
        submitted = true
        onSkip()
    }

    private func collectAnswers() -> [String: [String]] {
        var result: [String: [String]] = [:]
        for q in payload.questions {
            var picks = Array(answers[q.id] ?? []).sorted()
            if let other = otherText[q.id], !other.trimmingCharacters(in: .whitespaces).isEmpty {
                picks.append(other.trimmingCharacters(in: .whitespaces))
            }
            result[q.id] = picks
        }
        return result
    }
}
