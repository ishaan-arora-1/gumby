import Photos
import SwiftUI
import UIKit

/// Presents fullscreen preview + save/share for a remote image URL.
@MainActor
final class RemoteImagePreviewController: ObservableObject {
    static let shared = RemoteImagePreviewController()

    struct Presentation: Identifiable {
        let url: String
        var id: String { url }
    }

    @Published private(set) var presentation: Presentation?

    private init() {}

    func present(urlString: String) {
        guard !urlString.isEmpty, URL(string: urlString) != nil else { return }
        presentation = Presentation(url: urlString)
    }

    func dismiss() {
        presentation = nil
    }
}

private enum RemoteImageFetcher {
    static func uiImage(from urlString: String) async -> UIImage? {
        guard let url = URL(string: urlString) else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return UIImage(data: data)
        } catch {
            return nil
        }
    }

    /// Saves to Photos; prefers add-only authorization.
    static func saveToPhotos(_ image: UIImage) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw NSError(domain: "RemoteImagePreview", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Photos access denied"
            ])
        }

        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }
    }
}

private struct ActivityShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct RemoteImagePreviewSheet: View {
    let urlString: String
    var onDismiss: () -> Void

    @State private var image: UIImage?
    @State private var loading = true
    @State private var loadFailed = false
    @State private var saving = false
    @State private var saveErrorMessage: String?
    @State private var showShare = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if loading {
                    ProgressView()
                        .tint(.white)
                } else if loadFailed || image == nil {
                    ContentUnavailableView("Couldn’t load image", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.white.opacity(0.85))
                } else if let ui = image {
                    Image(uiImage: ui)
                        .resizable()
                        .scaledToFit()
                        .padding(.horizontal, 12)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done", action: onDismiss)
                        .foregroundStyle(AppConstants.textPrimary)
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        showShare = true
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .disabled(image == nil)

                    Button {
                        Task { await savePressed() }
                    } label: {
                        if saving {
                            ProgressView()
                                .tint(AppConstants.textPrimary)
                        } else {
                            Label("Download", systemImage: "square.and.arrow.down")
                        }
                    }
                    .disabled(image == nil || saving)
                }
            }
            .toolbarBackground(AppConstants.chatCanvasBlack, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .task(id: urlString) {
            await loadRemote()
        }
        .sheet(isPresented: $showShare) {
            if let ui = image {
                ActivityShareSheet(activityItems: [ui])
            }
        }
        .alert("Save failed", isPresented: Binding(
            get: { saveErrorMessage != nil },
            set: { if !$0 { saveErrorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { saveErrorMessage = nil }
        } message: {
            Text(saveErrorMessage ?? "")
        }
    }

    private func loadRemote() async {
        loading = true
        loadFailed = false
        image = nil
        let ui = await RemoteImageFetcher.uiImage(from: urlString)
        image = ui
        loadFailed = ui == nil
        loading = false
    }

    private func savePressed() async {
        guard let ui = image, !saving else { return }
        saving = true
        defer { saving = false }
        do {
            try await RemoteImageFetcher.saveToPhotos(ui)
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)
        } catch {
            saveErrorMessage = error.localizedDescription
        }
    }
}
