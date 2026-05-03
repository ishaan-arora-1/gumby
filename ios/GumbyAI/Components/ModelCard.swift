import SwiftUI

struct ModelCard: View {
    let model: ExploreModel
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                AsyncImage(url: URL(string: model.imageURL)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    RoundedRectangle(cornerRadius: 0)
                        .fill(AppConstants.surfaceColor)
                        .overlay(ProgressView().tint(.white))
                }
                .frame(height: 200)
                .clipped()
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(AppConstants.textPrimary)
                    
                    Text(model.pose)
                        .font(.caption)
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
