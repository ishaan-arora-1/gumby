import SwiftUI

/// Small balance pill that mirrors the web `CreditBalanceChip`. Shows the
/// current credit balance and a "+" affordance; tapping it opens the
/// paywall via `onTap`.
struct CreditBalanceChip: View {
    @EnvironmentObject private var credits: CreditsManager
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AppConstants.gradientColors.first ?? .white)
                Text("\(credits.balance)")
                    .font(.gumby(14, weight: .semiBold))
                    .foregroundStyle(AppConstants.textPrimary)
                    .monospacedDigit()
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(AppConstants.chatMutedLabel)
            }
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(Capsule().fill(AppConstants.chatComposerInner))
            .overlay(Capsule().stroke(Color.white.opacity(0.08), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}
