import SwiftUI

/// The AI Chat tab is now a guided UGC video studio. The user is funneled
/// through a series of structured "cards" (one per step) instead of a free
/// text conversation. We still render the screen as a vertical scroll so
/// it feels like a chat history — completed cards collapse into compact
/// summaries above the active one.
struct ChatView: View {
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService

    private var userFirstName: String {
        authService.currentUser?.name.split(separator: " ").first.map(String.init) ?? "there"
    }

    var body: some View {
        ZStack {
            AppConstants.chatCanvasBlack.ignoresSafeArea()

            VStack(spacing: 0) {
                chatHeader

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
                        .frame(width: 42, height: 42)
                        .background(Circle().fill(Color.white.opacity(0.1)))
                }
                Spacer()
                Button(action: { chatVM.newConversation() }) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 42, height: 42)
                        .background(Circle().fill(Color.white.opacity(0.1)))
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "wand.and.stars")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(AppConstants.accentGradient)
                Text("UGC Studio")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundColor(.white)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(AppConstants.chatCanvasBlack)
    }

    // MARK: - Step Stack

    @ViewBuilder
    private var stepStack: some View {
        // ---- Welcome / composer ----
        if chatVM.step == .welcome {
            UGCCardSurface(active: true) {
                UGCChatWelcomeCard(userFirstName: userFirstName)
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        // ---- Standalone creator pipeline (flows B & C) ----
        // The "Browse creators" affordance routes via .templatePicker, and the
        // composer routes via .generatingCreator → .creatorReady → either the
        // standalone terminal (.standaloneComplete) or the shared lip-sync
        // funnel starting at .productEntry.
        if chatVM.step == .templatePicker {
            UGCAssistantBubble(text: "Tap a creator to make them the face of your ad.", emoji: "person.crop.rectangle.stack")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatTemplatePickerCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        if chatVM.step == .generatingCreator {
            UGCAssistantBubble(text: "Casting your creator — Kling 2.6 is rolling.", emoji: "wand.and.stars")
                .transition(.opacity)
            UGCCardSurface(active: true) {
                UGCChatGeneratingCreatorCard()
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }

        if chatVM.step == .creatorReady {
            UGCAssistantBubble(text: "Here's your take. Lip-sync a script onto it — or keep it as-is.", emoji: "sparkles")
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

        // ---- Lip-sync funnel summary stack (flow A, and B after promotion) ----
        // We only render this once the user has actually entered the shared
        // funnel — otherwise the .templatePicker / .creatorReady cards above
        // own the canvas and we don't want a half-collapsed summary block.
        if chatVM.step.isLipsyncBranch {
            if let template = chatVM.pickedTemplate {
                UGCCardSurface(active: false) {
                    UGCChatTemplateSummaryCard(template: template)
                }
                .transition(.opacity)
            }

            // Product
            if chatVM.step == .productEntry {
                UGCAssistantBubble(text: "Got it — tell me what they'll be talking about.", emoji: "bag")
                    .transition(.opacity)
                UGCCardSurface(active: true) {
                    UGCChatProductCard()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if chatVM.step > .productEntry {
                UGCCardSurface(active: false) {
                    UGCChatProductSummaryCard()
                }
                .transition(.opacity)
            }

            // Script
            if chatVM.step == .scriptDraft {
                UGCAssistantBubble(text: "Here's a first take. Edit anything that doesn't sound like you — or hit regenerate.", emoji: "text.bubble")
                    .transition(.opacity)
                UGCCardSurface(active: true) {
                    UGCChatScriptCard()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if chatVM.step > .scriptDraft {
                UGCCardSurface(active: false) {
                    UGCChatScriptSummaryCard()
                }
                .transition(.opacity)
            }

            // Voice
            if chatVM.step == .voicePicker {
                UGCAssistantBubble(text: "Last call — what should they sound like?", emoji: "waveform")
                    .transition(.opacity)
                UGCCardSurface(active: true) {
                    UGCChatVoiceCard()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            } else if chatVM.step > .voicePicker {
                UGCCardSurface(active: false) {
                    UGCChatVoiceSummaryCard()
                }
                .transition(.opacity)
            }

            // Generating
            if chatVM.step == .generating {
                UGCAssistantBubble(text: "On it — assembling your ad.", emoji: "sparkles")
                    .transition(.opacity)
                UGCCardSurface(active: true) {
                    UGCChatGeneratingCard()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Complete
            if chatVM.step == .complete {
                UGCAssistantBubble(text: "Done. Tap to play, save, or share.", emoji: "checkmark.seal.fill")
                    .transition(.opacity)
                UGCCardSurface(active: true) {
                    UGCChatResultCard()
                }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
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
