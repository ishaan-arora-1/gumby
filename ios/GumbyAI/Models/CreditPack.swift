import Foundation

/// A purchasable bundle of credits.
///
/// This is the iOS mirror of the web `credit_packs` table (seeded in
/// backend `migrations/009_credits.sql` + `010_credits_usd.sql`). The
/// `credits` granted per pack are identical across web and iOS so a
/// "Creator" pack is worth the same 1,000 credits everywhere.
///
/// The price the user pays is NOT defined here: on iOS it comes from
/// StoreKit / App Store Connect (Apple owns pricing + currency
/// localization), so each pack maps to a StoreKit `productID`. We only
/// keep the *credit grant* and copy on the client.
struct CreditPack: Identifiable, Hashable {
    /// Stable pack id — matches the web `credit_packs.id` ("starter", …).
    let id: String
    /// StoreKit / App Store Connect product identifier. Must match the
    /// product configured in the `.storekit` test file locally and in
    /// App Store Connect for production.
    let productID: String
    let label: String
    let credits: Int
    let blurb: String
    let sortOrder: Int
    /// Highlighted as the recommended pack in the paywall.
    let highlighted: Bool

    /// The four packs the team finalized — kept in lockstep with the web
    /// seed rows. If you add/rename a pack, update App Store Connect (and
    /// the local `.storekit` file) so the `productID` resolves.
    static let all: [CreditPack] = [
        CreditPack(
            id: "starter",
            productID: "com.ishaan.gumby.credits.starter",
            label: "Starter",
            credits: 250,
            blurb: "5 short videos to try the product",
            sortOrder: 1,
            highlighted: false
        ),
        CreditPack(
            id: "creator",
            productID: "com.ishaan.gumby.credits.creator",
            label: "Creator",
            credits: 1000,
            blurb: "~20 short videos · best for solo creators",
            sortOrder: 2,
            highlighted: true
        ),
        CreditPack(
            id: "studio",
            productID: "com.ishaan.gumby.credits.studio",
            label: "Studio",
            credits: 3000,
            blurb: "~60 short videos · a month of daily content",
            sortOrder: 3,
            highlighted: false
        ),
        CreditPack(
            id: "agency",
            productID: "com.ishaan.gumby.credits.agency",
            label: "Agency",
            credits: 7500,
            blurb: "~150 short videos · agency-scale volume",
            sortOrder: 4,
            highlighted: false
        ),
    ]

    /// Every product identifier we ask StoreKit to load.
    static var allProductIDs: [String] { all.map(\.productID) }

    static func pack(forProductID productID: String) -> CreditPack? {
        all.first { $0.productID == productID }
    }

    static func pack(forID id: String) -> CreditPack? {
        all.first { $0.id == id }
    }
}
