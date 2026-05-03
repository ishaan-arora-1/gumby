import SwiftUI

struct MoodBoardCard: View {
    let moodBoard: MoodBoard
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                AsyncImage(url: URL(string: moodBoard.coverURL)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    RoundedRectangle(cornerRadius: 0)
                        .fill(AppConstants.surfaceColor)
                        .overlay(ProgressView().tint(.white))
                }
                .frame(height: 160)
                .clipped()
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(moodBoard.title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(AppConstants.textPrimary)
                    
                    Text(moodBoard.category)
                        .font(.caption)
                        .foregroundColor(AppConstants.textSecondary)
                    
                    Text("\(moodBoard.imageURLs.count) images")
                        .font(.caption2)
                        .foregroundColor(AppConstants.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
            }
            .background(AppConstants.surfaceColor)
            .clipShape(RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius))
        }
    }
}
