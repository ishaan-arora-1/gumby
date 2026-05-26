import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var historyVM: HistoryViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @Binding var selectedDestination: NavigationDestination
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                
                if historyVM.conversations.isEmpty && !historyVM.isLoading {
                    emptyState
                } else {
                    conversationsList
                }
            }
        }
        .task {
            await historyVM.loadHistory()
        }
    }
    
    private var header: some View {
        HStack {
            Button(action: { sidebarVM.toggle() }) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }
            
            Spacer()
            
            Text("History")
                .font(.headline)
                .foregroundColor(AppConstants.textPrimary)
            
            Spacer()
            
            Color.clear.frame(width: 28, height: 28)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 48))
                .foregroundColor(AppConstants.textSecondary)
            Text("No conversations yet")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(AppConstants.textPrimary)
            Text("Start chatting with Blinkugc")
                .font(.subheadline)
                .foregroundColor(AppConstants.textSecondary)
            Spacer()
        }
    }
    
    private var conversationsList: some View {
        List {
            ForEach(historyVM.conversations) { conversation in
                ConversationRow(conversation: conversation)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        openConversation(conversation)
                    }
                    .listRowBackground(AppConstants.backgroundColor)
                    .listRowSeparatorTint(AppConstants.textSecondary.opacity(0.2))
                    .onAppear {
                        if conversation.id == historyVM.conversations.last?.id {
                            Task { await historyVM.loadMore() }
                        }
                    }
            }
            .onDelete { indexSet in
                for index in indexSet {
                    let conv = historyVM.conversations[index]
                    Task { await historyVM.deleteConversation(conv) }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
    
    private func openConversation(_ conversation: Conversation) {
        Task {
            await chatVM.loadConversation(conversation.id)
            selectedDestination = .chat
        }
    }
}

struct ConversationRow: View {
    let conversation: Conversation
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(conversation.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(AppConstants.textPrimary)
                    .lineLimit(1)
                
                Spacer()
                
                Text(dateString)
                    .font(.caption)
                    .foregroundColor(AppConstants.textSecondary)
            }
            
            if let lastMessage = conversation.lastMessage, !lastMessage.isEmpty {
                Text(lastMessage)
                    .font(.caption)
                    .foregroundColor(AppConstants.textSecondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
    
    private var dateString: String {
        guard let date = conversation.createdAt else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
