import Foundation
import StoreKit

/// StoreKit 2 wrapper for the credit-pack In-App Purchases.
///
/// Responsibilities:
///   - Load the `Product`s for our four consumable credit packs.
///   - Drive a purchase, verifying Apple's cryptographic signature on the
///     resulting transaction on-device (`VerificationResult`).
///   - Listen for `Transaction.updates` (Ask-to-Buy approvals, purchases
///     made on another device, interrupted purchases) so credits are
///     always delivered exactly once and the transaction is `finish()`ed.
///   - Offer "Restore Purchases" (required by App Store Review).
///
/// On every verified, unfinished transaction we grant the matching pack's
/// credits through `CreditsManager` (keyed on the transaction id for
/// idempotency) and then finish the transaction. Credit packs are
/// *consumable* products, so Apple does not keep them in the receipt after
/// they're finished — delivery + local persistence is our responsibility,
/// which the on-device ledger handles.
@MainActor
final class StoreKitService: ObservableObject {
    /// Loaded StoreKit products, keyed by product id.
    @Published private(set) var products: [String: Product] = [:]
    @Published private(set) var isLoadingProducts = false
    /// Product id currently mid-purchase, for per-button spinners.
    @Published private(set) var purchasingProductID: String?
    /// Last user-facing error (nil when none).
    @Published var lastError: String?

    /// The ledger we deliver purchased credits into. Injected so the
    /// service stays testable and so we don't reach through the
    /// environment from a non-View type.
    private weak var credits: CreditsManager?

    private var updatesTask: Task<Void, Never>?

    // MARK: - Lifecycle

    /// Wire up the credit ledger and start the transaction listener.
    /// Call once, early in app launch, after `CreditsManager` exists.
    func start(credits: CreditsManager) {
        self.credits = credits
        // Begin listening BEFORE loading products so a transaction that
        // arrives during launch (e.g. a deferred Ask-to-Buy approval) is
        // never missed.
        if updatesTask == nil {
            updatesTask = Task.detached { [weak self] in
                for await update in Transaction.updates {
                    await self?.handle(verificationResult: update)
                }
            }
        }
        Task {
            await loadProducts()
            // Reconcile anything already in the entitlements / unfinished
            // queue (interrupted purchases, reinstalls).
            await syncUnfinishedTransactions()
        }
    }

    deinit { updatesTask?.cancel() }

    // MARK: - Products

    func loadProducts() async {
        isLoadingProducts = true
        defer { isLoadingProducts = false }
        do {
            let loaded = try await Product.products(for: CreditPack.allProductIDs)
            var map: [String: Product] = [:]
            for product in loaded { map[product.id] = product }
            self.products = map
        } catch {
            self.lastError = "Couldn't load store products. Check your connection and try again."
        }
    }

    func product(for pack: CreditPack) -> Product? {
        products[pack.productID]
    }

    /// Apple-localized price string (e.g. "$6.99", "₹599") for a pack, or
    /// nil if the product hasn't loaded yet.
    func displayPrice(for pack: CreditPack) -> String? {
        products[pack.productID]?.displayPrice
    }

    // MARK: - Purchase

    enum PurchaseOutcome: Equatable {
        case success
        case pending          // Ask-to-Buy / SCA — credits arrive later via updates
        case cancelled
        case failed(String)
    }

    @discardableResult
    func purchase(_ pack: CreditPack) async -> PurchaseOutcome {
        guard let product = products[pack.productID] else {
            let msg = "That pack isn't available right now."
            lastError = msg
            return .failed(msg)
        }
        purchasingProductID = pack.productID
        defer { purchasingProductID = nil }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                await handle(verificationResult: verification)
                return .success
            case .pending:
                // Deferred (parental approval / Strong Customer
                // Authentication). Credits are granted when the
                // transaction later lands in `Transaction.updates`.
                return .pending
            case .userCancelled:
                return .cancelled
            @unknown default:
                return .failed("Purchase could not be completed.")
            }
        } catch {
            let msg = error.localizedDescription
            lastError = msg
            return .failed(msg)
        }
    }

    // MARK: - Restore

    /// Ask StoreKit to refresh from the App Store, then re-run unfinished
    /// transactions. For consumables there's usually nothing to restore
    /// (Apple drops them once finished), but Review requires the control
    /// and it correctly recovers an interrupted/unfinished purchase.
    func restore() async {
        do {
            try await AppStore.sync()
        } catch {
            // `.sync()` throws on user cancel of the auth prompt — not an
            // error worth surfacing.
        }
        await syncUnfinishedTransactions()
    }

    // MARK: - Transaction handling

    /// Walk every transaction still owed delivery and apply it. Safe to
    /// call repeatedly — granting is idempotent on the transaction id.
    private func syncUnfinishedTransactions() async {
        for await result in Transaction.unfinished {
            await handle(verificationResult: result)
        }
    }

    /// Verify, grant credits, and finish a single transaction.
    private func handle(verificationResult result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            // An unverified transaction failed Apple's on-device signature
            // check — never grant credits for it.
            lastError = "Could not verify that purchase with the App Store."
            return
        }

        // Only our consumable credit packs grant credits. (Guards against
        // any future product types sharing this listener.)
        if let pack = CreditPack.pack(forProductID: transaction.productID) {
            await credits?.applyPurchase(
                pack: pack,
                transactionID: String(transaction.id)
            )
        }

        // Always finish — an unfinished transaction is redelivered forever.
        await transaction.finish()
    }
}
