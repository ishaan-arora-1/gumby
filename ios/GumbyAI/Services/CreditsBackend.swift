import Foundation

/// Abstraction over *where* the credit balance lives.
///
/// Today the iOS app ships with `LocalLedgerBackend` — the balance is an
/// on-device ledger. This is deliberate: the live backend can't yet grant
/// credits from an Apple purchase (that needs a new, not-yet-deployed
/// receipt-validation endpoint), and the production `/api/ugc/generate`
/// route currently runs with credits disabled, so it generates for free.
/// An on-device ledger lets us ship a fully Apple-compliant paid In-App
/// Purchase flow with zero backend changes.
///
/// When the server-side `POST /api/credits/apple/validate` endpoint is
/// deployed, drop in a `ServerLedgerBackend` implementation (validate the
/// StoreKit JWS server-side, grant into `user_credits`, read balance from
/// `GET /api/credits/balance`) and flip `CreditsManager`'s backend. No UI
/// or StoreKit code has to change.
protocol CreditsBackend {
    /// Current balance.
    func loadBalance() async -> Int
    /// Full ledger, newest first.
    func loadTransactions() async -> [CreditLedgerEntry]
    /// Credit the account. Idempotent on `refID` when one is supplied
    /// (e.g. a StoreKit transaction id) — a repeated grant is a no-op and
    /// returns the unchanged balance. Returns the new balance.
    @discardableResult
    func grant(amount: Int, reason: CreditReason, refID: String?, packID: String?) async throws -> Int
    /// Debit the account for a job. Throws `InsufficientCreditsError` if
    /// the balance can't cover it. Returns the new balance.
    @discardableResult
    func spend(amount: Int, jobID: String) async throws -> Int
    /// Refund a previously-spent job. Idempotent on `jobID` — refunding a
    /// job that was already refunded is a no-op. Returns the new balance.
    @discardableResult
    func refund(amount: Int, jobID: String) async throws -> Int
}

/// On-device credit ledger, persisted per user in `UserDefaults`.
///
/// The balance is derived from the immutable ledger so it can never drift:
/// `balance == sum(entry.delta)`. All mutations funnel through `append`,
/// which enforces idempotency and the no-overdraft rule — the same
/// invariants the SQL functions enforce server-side.
final class LocalLedgerBackend: CreditsBackend {
    private let defaults: UserDefaults
    private let storageKey: String
    private let queue = DispatchQueue(label: "com.ishaan.gumby.credits.ledger")

    /// - Parameter userID: scopes the ledger so two accounts on the same
    ///   device never share a balance. Falls back to a shared key for the
    ///   signed-out state (which shouldn't normally hold credits).
    init(userID: String?, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.storageKey = "credits.ledger.\(userID ?? "anonymous")"
    }

    // MARK: Persistence

    private func readEntries() -> [CreditLedgerEntry] {
        guard let data = defaults.data(forKey: storageKey) else { return [] }
        return (try? JSONDecoder().decode([CreditLedgerEntry].self, from: data)) ?? []
    }

    private func writeEntries(_ entries: [CreditLedgerEntry]) {
        if let data = try? JSONEncoder().encode(entries) {
            defaults.set(data, forKey: storageKey)
        }
    }

    // MARK: CreditsBackend

    func loadBalance() async -> Int {
        queue.sync { readEntries().reduce(0) { $0 + $1.delta } }
    }

    func loadTransactions() async -> [CreditLedgerEntry] {
        queue.sync { readEntries().sorted { $0.createdAt > $1.createdAt } }
    }

    @discardableResult
    func grant(amount: Int, reason: CreditReason, refID: String?, packID: String?) async throws -> Int {
        queue.sync {
            guard amount > 0 else {
                return readEntries().reduce(0) { $0 + $1.delta }
            }
            var entries = readEntries()
            // Idempotency: never apply the same purchase/grant twice.
            if let refID, entries.contains(where: { $0.refID == refID && $0.reason == reason }) {
                return entries.reduce(0) { $0 + $1.delta }
            }
            entries.append(
                CreditLedgerEntry(delta: amount, reason: reason, refID: refID, packID: packID)
            )
            writeEntries(entries)
            return entries.reduce(0) { $0 + $1.delta }
        }
    }

    @discardableResult
    func spend(amount: Int, jobID: String) async throws -> Int {
        try queue.sync {
            guard amount > 0 else {
                return readEntries().reduce(0) { $0 + $1.delta }
            }
            var entries = readEntries()
            let balance = entries.reduce(0) { $0 + $1.delta }
            guard balance >= amount else {
                throw InsufficientCreditsError(balance: balance, required: amount)
            }
            entries.append(
                CreditLedgerEntry(delta: -amount, reason: .spend, refID: jobID)
            )
            writeEntries(entries)
            return balance - amount
        }
    }

    @discardableResult
    func refund(amount: Int, jobID: String) async throws -> Int {
        queue.sync {
            var entries = readEntries()
            // Idempotent: at most one refund per job.
            if entries.contains(where: { $0.reason == .refund && $0.refID == jobID }) {
                return entries.reduce(0) { $0 + $1.delta }
            }
            guard amount > 0 else {
                return entries.reduce(0) { $0 + $1.delta }
            }
            entries.append(
                CreditLedgerEntry(delta: amount, reason: .refund, refID: jobID)
            )
            writeEntries(entries)
            return entries.reduce(0) { $0 + $1.delta }
        }
    }
}
