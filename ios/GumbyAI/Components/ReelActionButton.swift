import SwiftUI

enum ReelActionStyle {
    case frosted
    case mono
}

/// Shared 44×44 control used on Explore + Library reel feeds.
struct ReelActionButton: View {
    let systemName: String
    var style: ReelActionStyle = .frosted
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(style == .mono ? .black : .white)
                .frame(width: 44, height: 44)
                .background {
                    if style == .mono {
                        Circle().fill(Color.white)
                    } else {
                        Circle().fill(.ultraThinMaterial)
                    }
                }
        }
    }
}
