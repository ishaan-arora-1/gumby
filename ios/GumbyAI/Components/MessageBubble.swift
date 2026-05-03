import SwiftUI

struct MessageBubble: View {
    let message: Message
    
    private var isUser: Bool { message.role == .user }
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isUser { Spacer(minLength: 60) }
            
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if let imageURLs = message.imageURLs, !imageURLs.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(imageURLs, id: \.self) { url in
                                AsyncImage(url: URL(string: url)) { image in
                                    image.resizable().scaledToFill()
                                } placeholder: {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(AppConstants.surfaceColor)
                                        .overlay(ProgressView().tint(.white))
                                }
                                .frame(width: 120, height: 120)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
                
                if !message.content.isEmpty {
                    Text(message.content)
                        .font(.body)
                        .foregroundColor(isUser ? .white : AppConstants.textPrimary)
                        .padding(12)
                        .background(
                            isUser ?
                                AnyShapeStyle(AppConstants.accentGradient) :
                                AnyShapeStyle(AppConstants.surfaceColor)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
            
            if !isUser { Spacer(minLength: 60) }
        }
    }
}

struct StreamingBubble: View {
    let text: String
    @State private var showCursor = true
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(text + (showCursor ? "▊" : ""))
                    .font(.body)
                    .foregroundColor(AppConstants.textPrimary)
                    .padding(12)
                    .background(AppConstants.surfaceColor)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            Spacer(minLength: 60)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.5).repeatForever()) {
                showCursor.toggle()
            }
        }
    }
}
