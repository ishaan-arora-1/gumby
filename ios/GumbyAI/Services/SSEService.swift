import Foundation

struct SSEEvent {
    let type: String
    let text: String?
    let conversationId: String?
    let messageId: String?
    let error: String?
}

class SSEService {
    static let shared = SSEService()

    private var urlSession: URLSession?
    private var dataTask: URLSessionDataTask?

    func streamChat(
        conversationId: String?,
        message: String,
        imageUrls: [String],
        mode: String,
        onEvent: @escaping (SSEEvent) -> Void,
        onComplete: @escaping () -> Void,
        onError: @escaping (Error) -> Void
    ) {
        guard let url = URL(string: "\(AppConstants.baseURL)/chat/send") else {
            onError(APIError.invalidURL)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

        if let token = AuthService.shared.getToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body: [String: Any] = [
            "message": message,
            "imageUrls": imageUrls,
            "mode": mode
        ]
        if let convId = conversationId {
            body["conversationId"] = convId
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let delegate = SSEDelegate(
            onEvent: onEvent,
            onComplete: onComplete,
            onError: onError
        )

        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: .main)
        let task = session.dataTask(with: request)

        self.urlSession = session
        self.dataTask = task

        task.resume()
    }

    func cancel() {
        dataTask?.cancel()
        dataTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
    }
}

class SSEDelegate: NSObject, URLSessionDataDelegate {
    private var buffer = ""
    private let onEvent: (SSEEvent) -> Void
    private let onComplete: () -> Void
    private let onError: (Error) -> Void
    private var hasCompleted = false

    init(
        onEvent: @escaping (SSEEvent) -> Void,
        onComplete: @escaping () -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.onEvent = onEvent
        self.onComplete = onComplete
        self.onError = onError
    }

    private func callCompleteOnce() {
        guard !hasCompleted else { return }
        hasCompleted = true
        onComplete()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        buffer += text

        let lines = buffer.components(separatedBy: "\n\n")
        buffer = lines.last ?? ""

        for line in lines.dropLast() {
            processLine(line)
        }

        if buffer.hasSuffix("\n\n") {
            processLine(buffer)
            buffer = ""
        }
    }

    private func processLine(_ line: String) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("data: ") else { return }

        let jsonString = String(trimmed.dropFirst(6))
        guard let jsonData = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let type = json["type"] as? String else { return }

        let event = SSEEvent(
            type: type,
            text: json["text"] as? String,
            conversationId: json["conversationId"] as? String,
            messageId: json["messageId"] as? String,
            error: json["error"] as? String
        )

        onEvent(event)

        if type == "done" || type == "error" {
            callCompleteOnce()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            if (error as NSError).code != NSURLErrorCancelled {
                onError(error)
            }
        }
        callCompleteOnce()
    }
}
