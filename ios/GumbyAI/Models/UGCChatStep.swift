import Foundation

/// State machine for the UGC chat funnel.
///
/// The chat supports three branching flows that converge in the studio:
///
///   A. Models tab "Use" → chat opens already on `studio` with a curated
///      template selected.
///   B. Chat composer → user types a prompt → `generatingCreator` (Kling 3.0
///      text-to-video) → `creatorReady` → "Make a full ad" → `studio`.
///   C. Chat composer → user types a prompt → `generatingCreator` →
///      `creatorReady` → "Just save this clip" → `standaloneComplete`.
///
/// Note: the old step-by-step lipsync funnel (productEntry → scriptDraft →
/// productShots → voicePicker → generating → complete) is gone. Everything
/// the user fills in lives on the `studio` card now, and the final pipeline
/// is a single Kling 3.0 Pro call with built-in audio + lip-sync.
enum UGCChatStep: Int, Comparable, Codable {
    // Branch root — composer with prompt input + "browse creators" affordance.
    case welcome = 0
    // Optional alternative path: curated creator carousel.
    case templatePicker = 1
    // Text-to-video pipeline (B/C only).
    case generatingCreator = 2
    case creatorReady = 3
    // Combined studio screen — single card with every input.
    case studio = 4
    // Parallel terminal — user opted out of the full ad funnel.
    case standaloneComplete = 5

    static func < (lhs: UGCChatStep, rhs: UGCChatStep) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// True when the studio view should be shown.
    var isStudioBranch: Bool {
        self == .studio
    }

    /// True when the funnel has reached one of the terminal states.
    var isTerminal: Bool {
        self == .standaloneComplete
    }
}
