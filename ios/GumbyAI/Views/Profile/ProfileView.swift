import SwiftUI

/// Account / Settings sheet presented from the sidebar avatar.
/// Surfaces the legal URLs (Apple Guideline 5.1.1), support contact,
/// app version, and the destructive Sign Out + Delete Account actions.
struct ProfileView: View {
    @EnvironmentObject private var authService: AuthService
    @EnvironmentObject private var credits: CreditsManager
    @Environment(\.dismiss) private var dismiss

    @State private var showDeleteConfirm = false
    @State private var isDeleting = false
    @State private var showPaywall = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    accountCard
                    creditsSection
                    legalSection
                    supportSection
                    aboutSection
                    dangerZone
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 40)
            }
            .background(AppConstants.backgroundColor.ignoresSafeArea())
            .navigationTitle("Account")
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
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                isDeleting = true
                Task {
                    _ = await authService.deleteAccount()
                    isDeleting = false
                    dismiss()
                }
            }
        } message: {
            Text("This permanently deletes your Blinkugc account and all of your videos, drafts, and chat history. This action cannot be undone.")
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView()
        }
        .task { await credits.refresh() }
    }

    // MARK: - Credits

    private var creditsSection: some View {
        section(title: "Credits") {
            HStack(spacing: 12) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppConstants.gradientColors.first ?? .white)
                    .frame(width: 22)

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(credits.balance) credits")
                        .font(.gumby(15, weight: .semiBold))
                        .foregroundStyle(AppConstants.textPrimary)
                        .monospacedDigit()
                    Text("Used to generate videos")
                        .font(.gumby(12, weight: .regular))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                }

                Spacer()

                Button {
                    showPaywall = true
                } label: {
                    Text("Get credits")
                        .font(.gumby(13, weight: .semiBold))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 14)
                        .frame(height: 34)
                        .background(Capsule().fill(AppConstants.authPrimaryCTAFill))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
    }

    // MARK: - Account header

    private var accountCard: some View {
        HStack(spacing: 14) {
            avatar
                .frame(width: 56, height: 56)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.10), lineWidth: 1))

            VStack(alignment: .leading, spacing: 4) {
                Text(displayName)
                    .font(.gumby(17, weight: .semiBold))
                    .foregroundStyle(AppConstants.textPrimary)
                    .lineLimit(1)

                if let email = authService.currentUser?.email, !email.isEmpty {
                    Text(email)
                        .font(.gumby(13, weight: .regular))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .fill(AppConstants.chatComposerSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var avatar: some View {
        if let avatarURL = authService.currentUser?.avatarURL, let url = URL(string: avatarURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    avatarPlaceholder
                }
            }
        } else {
            avatarPlaceholder
        }
    }

    private var avatarPlaceholder: some View {
        ZStack {
            Color(white: 0.20)
            Text(initial)
                .font(.gumby(22, weight: .semiBold))
                .foregroundStyle(Color(white: 0.92))
        }
    }

    private var initial: String {
        let trimmed = (authService.currentUser?.name ?? "U")
            .trimmingCharacters(in: .whitespaces)
        return String(trimmed.prefix(1)).uppercased()
    }

    private var displayName: String {
        let name = authService.currentUser?.name ?? ""
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "Signed in" : trimmed
    }

    // MARK: - Legal

    private var legalSection: some View {
        section(title: "Legal") {
            row(
                icon: "doc.text",
                label: "Privacy Policy",
                accessory: .externalLink
            ) {
                UIApplication.shared.open(AppConstants.privacyPolicyURL)
            }
            divider
            row(
                icon: "doc.plaintext",
                label: "Terms of Service",
                accessory: .externalLink
            ) {
                UIApplication.shared.open(AppConstants.termsOfServiceURL)
            }
        }
    }

    // MARK: - Support

    private var supportSection: some View {
        section(title: "Support") {
            row(
                icon: "envelope",
                label: "Contact support",
                detail: AppConstants.supportEmail,
                accessory: .externalLink
            ) {
                if let url = URL(string: "mailto:\(AppConstants.supportEmail)") {
                    UIApplication.shared.open(url)
                }
            }
            divider
            row(
                icon: "globe",
                label: "Website",
                detail: "blinkugc.com",
                accessory: .externalLink
            ) {
                UIApplication.shared.open(AppConstants.websiteURL)
            }
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        section(title: "About") {
            HStack {
                Image(systemName: "info.circle")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .frame(width: 22)

                Text("Version")
                    .font(.gumby(15, weight: .regular))
                    .foregroundStyle(AppConstants.textPrimary)

                Spacer()

                Text(versionString)
                    .font(.gumby(14, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .monospacedDigit()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
    }

    private var versionString: String {
        let dict = Bundle.main.infoDictionary
        let short = dict?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = dict?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    // MARK: - Danger Zone

    private var dangerZone: some View {
        VStack(spacing: 12) {
            Button {
                authService.signOut()
                dismiss()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 15, weight: .medium))
                    Text("Sign out")
                        .font(.gumby(15, weight: .medium))
                }
                .foregroundStyle(AppConstants.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
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

            Button {
                showDeleteConfirm = true
            } label: {
                HStack(spacing: 10) {
                    if isDeleting {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .scaleEffect(0.85)
                    } else {
                        Image(systemName: "trash")
                            .font(.system(size: 15, weight: .medium))
                    }
                    Text("Delete account")
                        .font(.gumby(15, weight: .medium))
                }
                .foregroundStyle(Color(hex: "FF6B6B"))
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                        .fill(Color(hex: "FF6B6B").opacity(0.10))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius, style: .continuous)
                        .stroke(Color(hex: "FF6B6B").opacity(0.30), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(.top, 4)
    }

    // MARK: - Building blocks

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.gumby(11, weight: .semiBold))
                .tracking(0.8)
                .foregroundStyle(AppConstants.chatMutedLabel)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
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

    private enum RowAccessory {
        case chevron
        case externalLink
        case none
    }

    @ViewBuilder
    private func row(
        icon: String,
        label: String,
        detail: String? = nil,
        accessory: RowAccessory = .chevron,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(AppConstants.chatMutedLabel)
                    .frame(width: 22)

                Text(label)
                    .font(.gumby(15, weight: .regular))
                    .foregroundStyle(AppConstants.textPrimary)

                Spacer()

                if let detail {
                    Text(detail)
                        .font(.gumby(13, weight: .regular))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                switch accessory {
                case .chevron:
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                case .externalLink:
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppConstants.chatMutedLabel)
                case .none:
                    EmptyView()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.06))
            .frame(height: 1)
            .padding(.leading, 50)
    }
}
