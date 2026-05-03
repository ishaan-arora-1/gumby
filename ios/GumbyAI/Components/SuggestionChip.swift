import SwiftUI

struct SuggestionChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(
                    isSelected ?
                        AnyShapeStyle(AppConstants.accentGradient) :
                        AnyShapeStyle(AppConstants.surfaceColor)
                )
                .foregroundColor(isSelected ? .white : AppConstants.textSecondary)
                .clipShape(Capsule())
        }
    }
}
