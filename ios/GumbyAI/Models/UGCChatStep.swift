import Foundation

/// State machine for the UGC chat funnel.
///
/// The chat supports three branching flows that converge in the same lip-sync
/// pipeline (or, in option C, stop early):
///
///   A. Models tab "Use" → chat opens already on `productEntry` with a curated
///      template selected.
///   B. Chat composer → user types a prompt → `generatingCreator` (Kling 2.6
///      text-to-video) → `creatorReady` → "Make a full ad" → `productEntry`
///      → … → `complete`.
///   C. Chat composer → user types a prompt → `generatingCreator` →
///      `creatorReady` → "Just save this clip" → `standaloneComplete`.
///
/// We keep a linear `rawValue` ordering so the "summary stack" rendering can
/// detect "everything before the active step" via `step >= …`. The
/// `standaloneComplete` terminal sits at the end and is explicitly excluded
/// from the lip-sync summary stack via `isLipsyncBranch`.
enum UGCChatStep: Int, Comparable, Codable {
    // Branch root — composer with prompt input + "browse creators" affordance.
    case welcome = 0
    // Optional alternative path: curated creator carousel.
    case templatePicker = 1
    // Text-to-video pipeline (B/C only).
    case generatingCreator = 2
    case creatorReady = 3
    // Shared lip-sync funnel (used by A, and by B after promotion).
    case productEntry = 4
    case scriptDraft = 5
    case voicePicker = 6
    case generating = 7
    case complete = 8
    // Parallel terminal — user opted out of the lip-sync funnel.
    case standaloneComplete = 9

    static func < (lhs: UGCChatStep, rhs: UGCChatStep) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// True for any step inside the shared lip-sync funnel. Used by the chat
    /// renderer to decide whether to show the "Product → Script → Voice"
    /// summary stack.
    var isLipsyncBranch: Bool {
        switch self {
        case .productEntry, .scriptDraft, .voicePicker, .generating, .complete:
            return true
        default:
            return false
        }
    }

    /// True when the funnel has reached one of the two terminal states.
    var isTerminal: Bool {
        self == .complete || self == .standaloneComplete
    }
}
