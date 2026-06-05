import SwiftUI
import StoreKit

/// In-app credit store. Mirrors the visual structure of the web
/// `app/(app)/pricing/page.tsx` layout:
///
///   • Header: "Buy credits" kicker + display headline + current balance
///   • One pack card per pack, with:
///       - Apple-localized price (never USD-hardcoded, even pre-tap)
///       - Per-credit price computed from the live displayPrice
///       - Pack blurb
///       - Feature list: X × 5s videos, Y × 10s videos, captions, no expiry
///       - "Buy {pack}" CTA
///   • Footer: payment processor disclosure + Restore Purchases + legal links
///
/// Prices are **always** sourced from StoreKit's `displayPrice` (which
/// returns the user's local currency formatted by Apple — e.g. "₹599" for
/// an India sandbox/storefront, "$6.99" for US). We never read or display
/// the local Products.storekit file's test prices, and we don't fall back
/// to USD when products haven't loaded — we show a skeleton instead.
struct PaywallView: View {
    /// Optional banner explaining why the paywall appeared (e.g. blocked
    /// generation). When nil this is just the store.
    let contextMessage: String?

    @EnvironmentObject private var store: StoreKitService
    @EnvironmentObject private var credits: CreditsManager
    @Environment(\.dismiss) private var dismiss

    @State private var isRestoring = false
    @State private var banner: Banner?

    init(contextMessage: String? = nil) {
        self.contextMessage = contextMessage
    }

    private var packs: [CreditPack] {
        CreditPack.all.sorted { $0.sortOrder < $1.sortOrder }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    if let contextMessage {
                        contextBanner(contextMessage)
                    }
                    header
                    ForEach(packs) { pack in
                        packCard(pack)
                    }
                    restoreButton
                    legalFooter
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 40)
            }
            .background(AppConstants.backgroundColor.ignoresSafeArea())
            .navigationTitle("Credits")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AppConstants.textPrimary)
                        .font(.gumby(15, weight: .medium))
                }
            }
            .toolbarBackground(AppConstants.backgroundColor, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task {
            if store.products.isEmpty { await store.loadProducts() }
            await credits.refresh()
        }
        .overlay(alignment: .bottom) {
            if let banner {
                bannerView(banner)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: banner)
    }

    // MARK: - Header — kicker + title + current balance (web parity)

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("BUY CREDITS")
                    .font(.gumby(11, weight: .semiBold))
                    .tracking(0.8)
                    .foregroundStyle(AppConstants.chatMutedLabel)

                Text("Top up your studio.")
                    .font(.gumby(28, weight: .bold))
                    .foregroundStyle(AppConstants.textPrimary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Text("5-second video = 50 credits. 10-second video = 100 credits. Bigger packs land at a per-credit discount. Credits never expire.")
                    .font(.gumby(13, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Balance pill (matches the web "Current balance" right-aligned
            // group, but stacked under the headline on phone widths).
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CURRENT BALANCE")
                        .font(.gumby(11, weight: .semiBold))
                        .tracking(0.8)
                        .foregroundStyle(AppConstants.chatMutedLabel)

                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(AppConstants.gradientColors.first ?? .white)
                        Text("\(credits.balance)")
                            .font(.gumby(32, weight: .bold))
                            .foregroundStyle(AppConstants.textPrimary)
                            .monospacedDigit()
                        Text("credits")
                            .font(.gumby(13, weight: .regular))
                            .foregroundStyle(AppConstants.chatMutedLabel)
                    }
                }
                Spacer()
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                    .fill(AppConstants.chatComposerSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
    }

    private func contextBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(AppConstants.gradientColors.first ?? .orange)
            Text(message)
                .font(.gumby(14, weight: .medium))
                .foregroundStyle(AppConstants.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.orange.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.orange.opacity(0.30), lineWidth: 1)
        )
    }

    // MARK: - Pack card

    /// Per-credit price as a string in the user's local currency. We
    /// compute this from StoreKit's `Product.price` (Decimal, in the
    /// storefront's currency) divided by the pack's credit count, then
    /// format with the product's locale so the symbol/grouping/decimals
    /// match what Apple shows in `displayPrice`. Returns nil when the
    /// product hasn't loaded.
    private func perCreditText(for pack: CreditPack) -> String? {
        guard let product = store.product(for: pack) else { return nil }
        let total = product.price as NSDecimalNumber
        let perCredit = total.dividing(by: NSDecimalNumber(value: pack.credits))
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = product.priceFormatStyle.locale
        formatter.currencyCode = product.priceFormatStyle.currencyCode
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 3
        return formatter.string(from: perCredit)
    }

    private func packCard(_ pack: CreditPack) -> some View {
        let product = store.product(for: pack)
        let priceText = product?.displayPrice
        let isBusy = store.purchasingProductID == pack.productID
        let productMissing = product == nil && !store.isLoadingProducts

        let shortVideos = pack.credits / CreditCosts.costShortVideo
        let longVideos = pack.credits / CreditCosts.costLongVideo

        return VStack(alignment: .leading, spacing: 0) {
            // Top row: pack label + "Most popular" chip
            HStack {
                Text(pack.label)
                    .font(.gumby(13, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                Spacer()
                if pack.highlighted {
                    Text("MOST POPULAR")
                        .font(.gumby(10, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color(hex: "FF2E3F")))
                }
            }

            // Big price line — Apple-localized displayPrice.
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let priceText {
                    Text(priceText)
                        .font(.gumby(34, weight: .bold))
                        .foregroundStyle(AppConstants.textPrimary)
                        .monospacedDigit()
                } else if productMissing {
                    Text("Unavailable")
                        .font(.gumby(20, weight: .semiBold))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                } else {
                    // Loading skeleton — never show a fake/USD price.
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                        .frame(width: 120, height: 32)
                }
            }
            .padding(.top, 8)

            // Sub-line: credits + per-credit local price
            HStack(spacing: 6) {
                Text("\(pack.credits) credits")
                    .font(.gumby(12, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                if let perCredit = perCreditText(for: pack) {
                    Text("·")
                        .foregroundStyle(AppConstants.chatMutedLabel)
                    Text("\(perCredit)/credit")
                        .font(.gumby(12, weight: .regular))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                }
            }
            .padding(.top, 4)

            // Blurb
            Text(pack.blurb)
                .font(.gumby(13, weight: .regular))
                .foregroundStyle(AppConstants.textPrimary.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)

            // Feature list — matches the web Feature() rows.
            VStack(alignment: .leading, spacing: 8) {
                feature("\(shortVideos) × 5-second videos")
                feature("\(longVideos) × 10-second videos")
                feature("Captions included")
                feature("Credits never expire")
            }
            .padding(.top, 14)

            // Buy CTA
            Button {
                Task { await buy(pack) }
            } label: {
                HStack(spacing: 8) {
                    if isBusy {
                        ProgressView()
                            .tint(pack.highlighted ? .white : .black)
                            .scaleEffect(0.9)
                    } else if productMissing {
                        Text("Unavailable")
                            .font(.gumby(15, weight: .semiBold))
                    } else if priceText == nil {
                        Text("Loading…")
                            .font(.gumby(15, weight: .semiBold))
                    } else {
                        Image(systemName: "sparkles")
                            .font(.system(size: 12, weight: .heavy))
                        Text("Buy \(pack.label)")
                            .font(.gumby(15, weight: .semiBold))
                    }
                }
                .foregroundStyle(pack.highlighted ? Color.white : Color.black)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    Capsule(style: .continuous)
                        .fill(pack.highlighted
                              ? Color(hex: "FF2E3F")
                              : AppConstants.authPrimaryCTAFill)
                )
            }
            .buttonStyle(.plain)
            .disabled(isBusy || productMissing || priceText == nil || store.purchasingProductID != nil)
            .padding(.top, 18)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .fill(pack.highlighted
                      ? Color(hex: "FF2E3F").opacity(0.08)
                      : AppConstants.chatComposerSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .stroke(
                    pack.highlighted
                        ? Color(hex: "FF2E3F").opacity(0.55)
                        : Color.white.opacity(0.06),
                    lineWidth: pack.highlighted ? 1.5 : 1
                )
        )
    }

    private func feature(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color(hex: "34D399"))
                .frame(width: 14)
            Text(text)
                .font(.gumby(13, weight: .regular))
                .foregroundStyle(AppConstants.textPrimary.opacity(0.85))
        }
    }

    // MARK: - Restore + legal

    private var restoreButton: some View {
        Button {
            Task {
                isRestoring = true
                await store.restore()
                await credits.refresh()
                isRestoring = false
                showBanner(.init(text: "Purchases restored.", isError: false))
            }
        } label: {
            HStack(spacing: 8) {
                if isRestoring { ProgressView().tint(.white).scaleEffect(0.8) }
                Text("Restore Purchases")
                    .font(.gumby(14, weight: .medium))
            }
            .foregroundStyle(AppConstants.textPrimary)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .background(
                RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                    .fill(AppConstants.chatComposerSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isRestoring)
    }

    private var legalFooter: some View {
        VStack(spacing: 10) {
            Text("Payments processed by Apple In-App Purchase, charged to your Apple Account at confirmation. Credits are consumable, do not expire, and are non-refundable except where required by law. Your balance is stored locally to your account on this device.")
                .font(.gumby(11, weight: .regular))
                .foregroundStyle(AppConstants.chatMutedLabel)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button("Terms") { UIApplication.shared.open(AppConstants.termsOfServiceURL) }
                Text("·").foregroundStyle(AppConstants.chatMutedLabel)
                Button("Privacy") { UIApplication.shared.open(AppConstants.privacyPolicyURL) }
            }
            .font(.gumby(12, weight: .medium))
            .tint(AppConstants.chatMutedLabel)
        }
        .padding(.top, 6)
    }

    // MARK: - Purchase flow

    private func buy(_ pack: CreditPack) async {
        let outcome = await store.purchase(pack)
        await credits.refresh()
        switch outcome {
        case .success:
            showBanner(.init(text: "\(pack.credits) credits added.", isError: false))
        case .pending:
            showBanner(.init(text: "Purchase pending approval. Credits will appear once it's approved.", isError: false))
        case .cancelled:
            break
        case .failed(let message):
            showBanner(.init(text: message, isError: true))
        }
    }

    // MARK: - Banner

    private struct Banner: Equatable {
        let text: String
        let isError: Bool
    }

    private func showBanner(_ b: Banner) {
        banner = b
        Task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if banner == b { banner = nil }
        }
    }

    private func bannerView(_ b: Banner) -> some View {
        HStack(spacing: 10) {
            Image(systemName: b.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            Text(b.text)
                .font(.gumby(14, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(b.isError ? Color.red.opacity(0.9) : Color.green.opacity(0.85))
        )
    }
}
