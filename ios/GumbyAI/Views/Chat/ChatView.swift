import SwiftUI

/// The Studio tab — a SwiftUI mirror of `web/app/(app)/studio/page.tsx`.
///
/// Four states share the screen, matching the web `Step` union:
///   • **welcome** — prompt composer over a "Featured creators" grid
///     (`WebStudioWelcomeView`, which owns its own floating header).
///   • **studio** — the unified `WebStudioForm`.
///   • **generatingAd** — `WebGeneratingAdView` progress screen.
///   • **adDone** — `WebAdDoneView` finished-video screen.
struct ChatView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService

    var body: some View {
        ZStack {
            WebTheme.Color.canvas.ignoresSafeArea()

            VStack(spacing: 0) {
                // The welcome state owns its own floating header inside
                // WebStudioWelcomeView; every other state gets the fixed bar.
                if chatVM.step != .welcome {
                    header
                }

                if chatVM.step == .welcome {
                    WebStudioWelcomeView()
                } else {
                    funnelBody
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil, from: nil, for: nil
            )
        }
        .sheet(isPresented: $chatVM.showPaywall) {
            PaywallView(contextMessage: chatVM.paywallContext)
        }
    }

    // MARK: - Header (studio / generating / done)

    private var header: some View {
        ZStack {
            HStack {
                Button(action: { sidebarVM.toggle() }) {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
                Spacer()
                Button(action: { chatVM.newConversation() }) {
                    HStack(spacing: 5) {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .bold))
                        Text("New")
                            .font(WebTheme.Font.body(13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 34)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                }
            }
            Image("LogoCombined")
                .resizable()
                .scaledToFit()
                .frame(height: 28)
                .accessibilityLabel("Blinkugc")
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .background {
            WebTheme.Color.canvas
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 0.5)
                }
                .ignoresSafeArea(edges: .top)
        }
    }

    // MARK: - Funnel body (studio / generating / done)

    private var funnelBody: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    switch chatVM.step {
                    case .studio:
                        WebStudioForm()
                    case .generatingAd:
                        WebGeneratingAdView()
                    case .adDone:
                        WebAdDoneView()
                    case .welcome:
                        EmptyView()
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chatVM.activeJob?.progress ?? -1) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }
}

#Preview {
    ChatView()
        .environmentObject(ChatViewModel())
        .environmentObject(SidebarViewModel())
        .environmentObject(AuthService.shared)
}
