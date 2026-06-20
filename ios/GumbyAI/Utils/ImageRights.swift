import Foundation

/// Image-rights consent tracking — 1:1 port of `web/lib/imageRights.ts`.
///
/// The user confirms ownership / no-nudity for the images they upload. We
/// tie that consent to the IMAGES, not to a session or a single click:
/// once a given image URL has been confirmed, we don't re-ask for it — but
/// the moment a NEW (unconfirmed) image is added, the next send re-prompts.
///
/// On the web, confirmed URLs live in `sessionStorage` so consent survives
/// the welcome-composer → studio-form hand-off and resets when the tab/
/// session ends. The iOS analog is a process-lifetime in-memory set: it
/// survives view re-creation and the composer → form hand-off (the same
/// signed URLs flow through), and resets on app relaunch.
enum ImageRights {
    private static var confirmed = Set<String>()

    /// True if every provided URL has already been rights-confirmed.
    static func allConfirmed(_ urls: [String]) -> Bool {
        if urls.isEmpty { return true } // nothing to confirm
        return urls.allSatisfy { confirmed.contains($0) }
    }

    /// True if at least one of the provided URLs is NOT yet confirmed.
    static func hasUnconfirmed(_ urls: [String]) -> Bool {
        !urls.isEmpty && !allConfirmed(urls)
    }

    /// Mark the given image URLs as rights-confirmed for the rest of the run.
    static func markConfirmed(_ urls: [String]) {
        for u in urls where !u.isEmpty { confirmed.insert(u) }
    }
}
