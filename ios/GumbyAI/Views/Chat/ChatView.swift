import SwiftUI

/// Full-screen chat canvas from `bg.png`. Uses aspect-fit (not fill) so the
/// artwork's soft edges and color bands aren't cropped on taller/wider phones.
private struct ChatBackgroundImage: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black
                Image("ChatBackground")
                    .resizable()
                    .scaledToFit()
                    .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .ignoresSafeArea()
    }
}

/// The AI Chat tab is the "Blinkugc" studio.
///
/// Two visual modes share the same screen:
///   • **Welcome** (`chatVM.step == .welcome`) — brand background image with
///     a horizontal template carousel up top, a suggested-prompt list,
///     and a pinned composer at the bottom. This is the user's entry point
///     for flows B/C (text-to-video creator generation).
///   • **Funnel** (any other step) — a vertical scroll of step cards on the
///     same background canvas. This is the shared lip-sync funnel used by all
///     three flows once the user picks/promotes a creator.
struct ChatView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService

    var body: some View {
        ZStack {
            if chatVM.step == .studio {
                // Clean dark canvas for the studio — no artwork, just solid dark
                Color(hex: "0A0A0A").ignoresSafeArea()
            } else {
                ChatBackgroundImage()
            }

            VStack(spacing: 0) {
                if chatVM.step == .studio {
                    studioHeader
                } else {
                    chatHeader
                }

                if chatVM.step == .welcome {
                    welcomeBody
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
    }

    // MARK: - Header

    private var chatHeader: some View {
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
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Color.white.opacity(0.12)))
                }
            }
            Image("LogoCombined")
                .resizable()
                .scaledToFit()
                .frame(height: 30)
                .accessibilityLabel("Blinkugc")
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    // MARK: - Studio header (video editing themed)

    private var studioHeader: some View {
        HStack(spacing: 12) {
            Button {
                chatVM.newConversation()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.08)))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(chatVM.pickedTemplate?.actorName ?? "Studio")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Circle()
                        .fill(Color(hex: "34C759"))
                        .frame(width: 6, height: 6)
                    Text("\(chatVM.drafts.count) draft\(chatVM.drafts.count == 1 ? "" : "s")")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "8E8E93"))
                }
            }

            Spacer()

            Button {
                chatVM.newConversation()
            } label: {
                Image(systemName: "plus.circle")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(Color(hex: "8E8E93"))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(Color(hex: "0A0A0A"))
    }

    // MARK: - Welcome body (landing hero + pinned composer)

    private var welcomeBody: some View {
        VStack(spacing: 0) {
            ScrollView {
                UGCChatWelcomeBody()
                    .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            UGCChatComposerBar()
        }
    }

    // MARK: - Funnel body (step stack)

    private var funnelBody: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 14) {
                    stepStack
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 14)
                .padding(.top, 6)
                .padding(.bottom, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: chatVM.step) { _, _ in
                DispatchQueue.main.async {
                    withAnimation(.easeOut(duration: 0.35)) {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }
            .onChange(of: chatVM.activeJob?.progress ?? -1) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: chatVM.activeCreatorJob?.progress ?? -1) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    // MARK: - Step Stack (funnel mode)

    @ViewBuilder
    private var stepStack: some View {
        // Standalone creator pipeline (flows B & C). The "Browse creators"
        // affordance routes via .templatePicker; the composer routes via
        // .generatingCreator → .creatorReady → either .standaloneComplete
        // or .studio (after promoting the creator into a hidden template).
        if chatVM.step == .templatePicker {
            UGCAssistantBubble(text: "Tap a creator to make them the face of your ad.", emoji: "person.crop.rectangle.stack")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatTemplatePickerCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        if chatVM.step == .generatingCreator {
            UGCAssistantBubble(text: "Casting your creator — Kling is rolling.", emoji: "wand.and.stars")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatGeneratingCreatorCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        if chatVM.step == .creatorReady {
            UGCAssistantBubble(text: "Here's your take. Turn it into a full ad — or keep it as-is.", emoji: "sparkles")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatCreatorReadyCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        if chatVM.step == .standaloneComplete {
            UGCAssistantBubble(text: "Done. Save it, share it, or upgrade it to a full ad later.", emoji: "checkmark.seal.fill")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatStandaloneResultCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        // Studio (iterative regeneration UI — the full ad funnel collapsed
        // into a single card with every input on it).
        if chatVM.step == .studio {
            UGCStudioView()
                .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}

#Preview {
    ChatView()
        .environmentObject(ChatViewModel())
        .environmentObject(SidebarViewModel())
        .environmentObject(AuthService.shared)
}
