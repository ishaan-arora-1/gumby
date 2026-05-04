import Foundation

struct Message: Codable, Identifiable {
    let id: String
    let conversationID: String
    let role: MessageRole
    let content: String
    let imageURLs: [String]?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case conversationID = "conversation_id"
        case role, content
        case imageURLs = "image_urls"
        case createdAt = "created_at"
    }

    static let questionsMarker = "__QUESTIONS__\n"

    var questions: QuestionsPayload? {
        guard role == .assistant,
              content.hasPrefix(Message.questionsMarker) else { return nil }
        let jsonString = String(content.dropFirst(Message.questionsMarker.count))
        guard let data = jsonString.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(QuestionsPayload.self, from: data)
    }

    var isQuestionsMessage: Bool { questions != nil }
}

enum MessageRole: String, Codable {
    case user
    case assistant
}

struct QuestionsPayload: Codable, Equatable {
    let intro: String
    let questions: [ClarifyingQuestion]
}

struct ClarifyingQuestion: Codable, Equatable, Identifiable {
    var id: String { prompt }
    let prompt: String
    let type: QuestionType
    let options: [QuestionOption]
}

enum QuestionType: String, Codable, Equatable {
    case single
    case multiple
}

struct QuestionOption: Codable, Equatable, Identifiable {
    var id: String { label }
    let label: String
    let description: String?
}
