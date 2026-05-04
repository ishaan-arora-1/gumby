import Foundation

enum ChatMode: String, CaseIterable {
    case ideas = "Ideas"
    case captions = "Captions"
    case posts = "Posts"

    /// Wire value sent to backend. Stable lowercase identifier.
    var apiValue: String {
        switch self {
        case .ideas: return "ideas"
        case .captions: return "captions"
        case .posts: return "posts"
        }
    }

    /// Short label prefixed to each user message so the model (and the user) sees what they chose.
    var promptHintPrefix: String {
        switch self {
        case .ideas: return "[Mode: Ideas]"
        case .captions: return "[Mode: Captions]"
        case .posts: return "[Mode: Posts]"
        }
    }
}

/// User-selectable image proportion for generated visuals.
/// `post` = Instagram feed (1:1), `story` = full-screen Story (9:16).
enum ImageAspect: String, CaseIterable {
    case post
    case story

    var apiValue: String { rawValue }

    /// Compact ratio shown in the toolbar capsule. Always one short string so it never wraps.
    var shortLabel: String {
        switch self {
        case .post: return "1:1"
        case .story: return "9:16"
        }
    }

    var menuLabel: String {
        switch self {
        case .post: return "Instagram Post (1:1)"
        case .story: return "Instagram Story (9:16)"
        }
    }

    /// Icon whose proportions visually match the chosen ratio.
    var iconName: String {
        switch self {
        case .post: return "square"
        case .story: return "rectangle.portrait"
        }
    }
}
