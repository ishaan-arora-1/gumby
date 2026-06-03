import SwiftUI
import StoreKit

/// The in-app credit store. Mirrors the web `/pricing` page but uses
/// Apple In-App Purchase instead of Razorpay (required by App Store
/// Review Guideline 3.1.1 for in-app digital goods).
///
/// Prices are never hardcoded — they come from StoreKit
/// (`product.displayPrice`), localized to the user's App Store region and
/// currency by Apple. We only own the credit grant and the marketing copy.
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
                    balanceHeader
                    if store.isLoadingProducts && store.products.isEmpty {
                        loadingState
                    } else {
                        ForEach(packs) { pack in
                            packCard(pack)
                        }
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

    // MARK: - Header

    private var balanceHeader: some View {
        VStack(spacing: 6) {
            Text("YOUR BALANCE")
                .font(.gumby(11, weight: .semiBold))
                .tracking(0.8)
                .foregroundStyle(AppConstants.chatMutedLabel)
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppConstants.gradientColors.first ?? .white)
                Text("\(credits.balance)")
                    .font(.gumby(34, weight: .bold))
                    .foregroundStyle(AppConstants.textPrimary)
                    .monospacedDigit()
                Text("credits")
                    .font(.gumby(15, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
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

    private func packCard(_ pack: CreditPack) -> some View {
        let priceText = store.displayPrice(for: pack)
        let isBusy = store.purchasingProductID == pack.productID
        let productMissing = store.product(for: pack) == nil && !store.isLoadingProducts

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(pack.label)
                    .font(.gumby(18, weight: .semiBold))
                    .foregroundStyle(AppConstants.textPrimary)
                if pack.highlighted {
                    Text("POPULAR")
                        .font(.gumby(10, weight: .bold))
                        .tracking(0.6)
                        .foregroundStyle(.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(AppConstants.gradientColors.first ?? .white))
                }
                Spacer()
                Text("\(pack.credits) credits")
                    .font(.gumby(14, weight: .semiBold))
                    .foregroundStyle(AppConstants.gradientColors.first ?? .white)
                    .monospacedDigit()
            }

            Text(pack.blurb)
                .font(.gumby(13, weight: .regular))
                .foregroundStyle(AppConstants.chatMutedLabel)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await buy(pack) }
            } label: {
                HStack {
                    if isBusy {
                        ProgressView().tint(.black).scaleEffect(0.9)
                    } else {
                        Text(productMissing ? "Unavailable" : (priceText ?? "—"))
                            .font(.gumby(16, weight: .semiBold))
                    }
                }
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(
                    RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                        .fill(productMissing ? Color.white.opacity(0.25) : AppConstants.authPrimaryCTAFill)
                )
            }
            .buttonStyle(.plain)
            .disabled(isBusy || productMissing || store.purchasingProductID != nil)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .stroke(
                    pack.highlighted
                        ? (AppConstants.gradientColors.first ?? .white).opacity(0.55)
                        : Color.white.opacity(0.06),
                    lineWidth: pack.highlighted ? 1.5 : 1
                )
        )
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView().tint(.white)
            Text("Loading packs…")
                .font(.gumby(13, weight: .regular))
                .foregroundStyle(AppConstants.chatMutedLabel)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
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
            Text("Credits are a digital good delivered instantly in the app and are used to generate videos. Payment is charged to your Apple Account at confirmation of purchase. Credits are consumable, do not expire, and are non-refundable except where required by law. On this device, your balance is stored locally to your account.")
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
