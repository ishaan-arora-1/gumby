import Foundation

/// Server-authoritative credit ledger — the balance lives in the backend's
/// `user_credits` table, shared with the website.
///
/// This replaces `LocalLedgerBackend` for signed-in users now that the
/// production `/ugc/generate` route enforces credits server-side:
///
///   - `loadBalance` / `loadTransactions` read the real ledger.
///   - `applePurchase` POSTs the StoreKit transaction's `jwsRepresentation`
///     to `/credits/apple/validate`, where the server re-verifies it with
///     Apple's certificate chain and grants the pack idempotently on the
///     transaction id. Throwing here tells `StoreKitService` NOT to
///     `finish()` the transaction, so StoreKit redelivers it later — a
///     paid purchase can never be silently lost.
///   - `spend` / `refund` are read-through no-ops: the server debits when
///     a generation succeeds and refunds when one fails, so the client
///     just refreshes its view of the balance.
final class ServerCreditsBackend: CreditsBackend {
    private let api = APIService.shared

    private struct BalancePayload: Codable { let balance: Int }
    private struct ValidatePayload: Codable {
        let balance: Int
        let granted: Bool
        let credits: Int
    }
    /// Row shape of GET /credits/transactions (credit_transactions table).
    private struct ServerTxn: Codable {
        let id: String
        let delta: Int
        let reason: String
        let refId: String?
        let packId: String?
        let createdAt: String

        enum CodingKeys: String, CodingKey {
            case id, delta, reason
            case refId = "ref_id"
            case packId = "pack_id"
            case createdAt = "created_at"
        }
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    func loadBalance() async -> Int {
        let resp: APIResponse<BalancePayload>? = try? await api.get(path: "/credits/balance")
        return resp?.data?.balance ?? 0
    }

    func loadTransactions() async -> [CreditLedgerEntry] {
        let resp: APIResponse<[ServerTxn]>? = try? await api.get(path: "/credits/transactions")
        return (resp?.data ?? []).map { txn in
            CreditLedgerEntry(
                id: UUID(uuidString: txn.id) ?? UUID(),
                delta: txn.delta,
                reason: CreditReason(rawValue: txn.reason) ?? .grant,
                refID: txn.refId,
                packID: txn.packId,
                createdAt: Self.isoFormatter.date(from: txn.createdAt)
                    ?? ISO8601DateFormatter().date(from: txn.createdAt)
                    ?? Date()
            )
        }
    }

    @discardableResult
    func grant(amount: Int, reason: CreditReason, refID: String?, packID: String?) async throws -> Int {
        // The server owns grants (purchases go through applePurchase; promo
        // grants happen server-side). Just report the current balance.
        await loadBalance()
    }

    @discardableResult
    func spend(amount: Int, jobID: String) async throws -> Int {
        // Server debits on generation success — refresh only.
        await loadBalance()
    }

    @discardableResult
    func refund(amount: Int, jobID: String) async throws -> Int {
        // Server refunds failed jobs itself — refresh only.
        await loadBalance()
    }

    @discardableResult
    func applePurchase(jws: String, transactionID: String, pack: CreditPack) async throws -> Int {
        let resp: APIResponse<ValidatePayload> = try await api.post(
            path: "/credits/apple/validate",
            body: ["jws": jws]
        )
        guard let data = resp.data else { throw APIError.noData }
        return data.balance
    }
}
