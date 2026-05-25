import SwiftUI

enum GumbyFontWeight {
    case regular
    case medium
    case semiBold
    case bold

    var postScriptName: String {
        switch self {
        case .regular: "Inter-Regular"
        case .medium: "Inter-Medium"
        case .semiBold: "Inter-SemiBold"
        case .bold: "Inter-Bold"
        }
    }
}

extension Font {
    static func gumby(_ size: CGFloat, weight: GumbyFontWeight = .regular) -> Font {
        .custom(weight.postScriptName, size: size)
    }
}
