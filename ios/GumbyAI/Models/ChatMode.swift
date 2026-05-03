import Foundation

enum ChatMode: String, CaseIterable {
    case captions = "Captions"
    case ideas = "Ideas"
    case build = "Build"
    
    var systemPrompt: String {
        switch self {
        case .captions:
            return "You are a social media caption expert. Help create engaging, platform-optimized captions with relevant hashtags."
        case .ideas:
            return "You are a creative social media strategist. Generate innovative content ideas, campaign concepts, and trending topic suggestions."
        case .build:
            return "You are a social media content builder. Help create complete post packages including copy, hashtags, posting schedule, and content strategy."
        }
    }
}
