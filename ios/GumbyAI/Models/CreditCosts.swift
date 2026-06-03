import Foundation

/// Credit pricing for a generation, mirrored byte-for-byte from the
/// backend so the client preflight matches what the server *would* charge
/// when server-side credits are switched on.
///
/// Backend reference (`backend/src/services/credits.js`):
///   COST_PER_VIDEO = { 5: 50, 10: 100 }
///   creditsForVideoDuration(seconds): seconds >= 8 ? 100 : 50
enum CreditCosts {
    static let costShortVideo = 50   // ≤ ~7s  → 5s bucket
    static let costLongVideo = 100   // ≥ 8s   → 10s bucket

    /// Credits required to generate a full ad of the given duration.
    /// Only the full-ad ("talking creator") pipeline is charged — silent
    /// creator text-to-video is free on the backend, so we don't charge
    /// for it on the client either.
    static func cost(forSeconds seconds: Int) -> Int {
        seconds >= 8 ? costLongVideo : costShortVideo
    }
}
