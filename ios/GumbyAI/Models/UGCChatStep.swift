import Foundation

/// State machine for the studio funnel — a 1:1 mirror of the website's
/// `web/app/(app)/studio/page.tsx` `Step` union:
///
///   `'welcome' | 'studio' | 'generating_ad' | 'ad_done'`
///
/// The flow is unified and free-form, exactly like the web:
///
///   1. **welcome** — prompt composer (prompt + up to 5 reference images,
///      aspect ratio, duration) over a "Featured creators" grid. Submitting
///      the composer — or picking a creator — drops the user into the studio
///      form. No `/parse-prompt` round-trip; the user's prompt is the single
///      source of truth.
///   2. **studio** — the unified `StudioForm`: prompt + references, format,
///      talking-creator → script + captions. "Generate" fires a single
///      `/ugc/generate` call (the backend classifies each image's role
///      itself).
///   3. **generatingAd** — progress card while the one-shot pipeline runs.
///   4. **adDone** — the finished video with download / share / regenerate.
///
/// The old branched flows (template picker, standalone Kling text-to-video
/// "creator generation", the multi-draft regenerate stack) are gone — the
/// website removed them, so iOS does too.
enum UGCChatStep: Int, Comparable, Codable {
    case welcome = 0
    case studio = 1
    case generatingAd = 2
    case adDone = 3

    static func < (lhs: UGCChatStep, rhs: UGCChatStep) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// True when the studio form should be shown.
    var isStudioBranch: Bool { self == .studio }

    /// True when the funnel has reached its terminal state.
    var isTerminal: Bool { self == .adDone }
}
