import Foundation
import SwiftUI

/// Observable owner of the user's credit balance and ledger.
///
/// The view layer reads `balance`/`transactions` off this object; the
/// generation flow calls `preflight`/`spend`/`refund`; `StoreKitService`
/// calls `applyPurchase` after a verified purchase. The actual storage is
/// delegated to a `CreditsBackend` (today: on-device `LocalLedgerBackend`).
@MainActor
final class CreditsManager: ObservableObject {
    @Published private(set) var balance: Int = 0
    @Published private(set) var transactions: [CreditLedgerEntry] = []

    private var backend: CreditsBackend
    private var currentUserID: String?

    /// Signed-in users read/write the SERVER ledger (`user_credits`) — the
    /// same balance the generation route enforces, so the paywall, the
    /// balance chip, and the 402 preflight can never disagree. The local
    /// UserDefaults ledger only backs the signed-out state.
    private static func makeBackend(userID: String?) -> CreditsBackend {
        userID != nil ? ServerCreditsBackend() : LocalLedgerBackend(userID: userID)
    }

    init(userID: String? = nil) {
        self.currentUserID = userID
        self.backend = Self.makeBackend(userID: userID)
    }

    /// Re-point the ledger at a (possibly different) user — call on sign
    /// in / sign out / account switch. No-op if the user is unchanged.
    func reload(forUserID userID: String?) async {
        if userID != currentUserID {
            currentUserID = userID
            backend = Self.makeBackend(userID: userID)
        }
        await refresh()
    }

    /// Pull the latest balance + ledger from the backend into the
    /// published properties.
    func refresh() async {
        let bal = await backend.loadBalance()
        let txns = await backend.loadTransactions()
        self.balance = bal
        self.transactions = txns
    }

    // MARK: - Cost helpers

    func cost(forSeconds seconds: Int) -> Int {
        CreditCosts.cost(forSeconds: seconds)
    }

    func hasSufficient(forSeconds seconds: Int) -> Bool {
        balance >= cost(forSeconds: seconds)
    }

    // MARK: - Spend / refund (generation)

    /// Preflight before kicking off a generation. Returns the cost if the
    /// balance covers it; throws `InsufficientCreditsError` otherwise so
    /// the caller can present the paywall.
    func preflight(forSeconds seconds: Int) throws -> Int {
        let required = cost(forSeconds: seconds)
        guard balance >= required else {
            throw InsufficientCreditsError(balance: balance, required: required)
        }
        return required
    }

    /// Debit `amount` credits against a started job. Mirrors the backend
    /// debit-on-accept behaviour. Updates published state.
    @discardableResult
    func spend(amount: Int, jobID: String) async throws -> Int {
        let newBalance = try await backend.spend(amount: amount, jobID: jobID)
        await refresh()
        return newBalance
    }

    /// Refund a failed job (idempotent). Mirrors the backend's
    /// `refundForJob` — called when a job's status flips to `failed`.
    func refund(amount: Int, jobID: String) async {
        _ = try? await backend.refund(amount: amount, jobID: jobID)
        await refresh()
    }

    // MARK: - Purchases (StoreKit)

    /// Deliver a verified In-App Purchase. The server backend re-validates
    /// the transaction's JWS with Apple and grants server-side credits
    /// (idempotent on `transactionID`). Returns `true` only when delivery
    /// succeeded — the caller must NOT `finish()` the StoreKit transaction
    /// otherwise, so an offline/unreachable server just means StoreKit
    /// redelivers the purchase later.
    func applyPurchase(pack: CreditPack, transactionID: String, jws: String) async -> Bool {
        do {
            _ = try await backend.applePurchase(
                jws: jws,
                transactionID: transactionID,
                pack: pack
            )
            await refresh()
            return true
        } catch {
            await refresh()
            return false
        }
    }

    // MARK: - Debug / promo

    /// Manual grant (e.g. a first-run promo). Kept generic; not wired to
    /// any UI by default.
    func grantPromo(amount: Int, refID: String) async {
        _ = try? await backend.grant(amount: amount, reason: .grant, refID: refID, packID: nil)
        await refresh()
    }
}
