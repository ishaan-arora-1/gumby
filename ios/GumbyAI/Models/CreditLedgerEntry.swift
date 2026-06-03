import Foundation

/// Why a credit balance changed. Mirrors the web `credit_transactions.reason`
/// vocabulary so the two ledgers stay conceptually identical.
enum CreditReason: String, Codable {
    case purchase   // bought a pack via In-App Purchase
    case spend      // debited to start a video generation job
    case refund     // refunded because a generation job failed
    case grant      // promotional / manual grant
}

/// One immutable line in the on-device credit ledger.
///
/// On iOS the ledger is the local source of truth for the balance (see
/// `CreditsManager`). `refID` is the idempotency key:
///   - purchases  → the StoreKit transaction id (so a redelivered
///                  transaction can't double-credit)
///   - spends     → the `ugc_jobs.id` the credits were spent on
///   - refunds    → the same job id (so we refund a failed job at most once)
struct CreditLedgerEntry: Identifiable, Codable, Hashable {
    let id: UUID
    /// Positive for grants/purchases/refunds, negative for spends.
    let delta: Int
    let reason: CreditReason
    let refID: String?
    let packID: String?
    let createdAt: Date

    init(
        id: UUID = UUID(),
        delta: Int,
        reason: CreditReason,
        refID: String? = nil,
        packID: String? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.delta = delta
        self.reason = reason
        self.refID = refID
        self.packID = packID
        self.createdAt = createdAt
    }
}

/// Thrown by the ledger when a spend would overdraw the balance. The
/// generation flow maps this to the insufficient-credits paywall.
struct InsufficientCreditsError: LocalizedError {
    let balance: Int
    let required: Int
    var shortfall: Int { max(0, required - balance) }
    var errorDescription: String? {
        "You need \(required) credits but only have \(balance)."
    }
}
