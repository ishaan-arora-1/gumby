import SwiftUI
import PhotosUI

/// SwiftUI port of `web/components/studio/BlueprintModal.tsx`.
///
/// The whole pitch of a blueprint is "one photo, nothing else to decide" —
/// so this sheet is intentionally tiny: product photo (required, uploaded
/// through the moderated `/ugc/upload-attachment` endpoint), product name
/// (optional but recommended), one optional detail line for talking
/// templates, and Generate.
struct WebBlueprintModal: View {
    let blueprint: Blueprint
    @EnvironmentObject var chatVM: ChatViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var pickerItem: PhotosPickerItem?
    @State private var productImage: UIImage?
    @State private var remoteUrl: String?
    @State private var uploading = false
    @State private var uploadError: String?
    @State private var productName = ""
    @State private var productDescription = ""

    private var credits: Int {
        blueprint.durationSeconds >= 13 ? 150 : blueprint.durationSeconds >= 8 ? 100 : 50
    }

    private var accent1: Color {
        Color(hex: blueprint.accent.first?.replacingOccurrences(of: "#", with: "") ?? "444444")
    }
    private var accent2: Color {
        Color(hex: blueprint.accent.last?.replacingOccurrences(of: "#", with: "") ?? "111111")
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                photoDrop
                fields
                if let err = uploadError ?? chatVM.blueprintError {
                    Text(err)
                        .font(WebTheme.Font.body(13))
                        .foregroundColor(Color(hex: "FF453A"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                generateButton
                Text("\(blueprint.durationSeconds)s vertical video · \(blueprint.creatorSpeaks ? "script written for you, captions included" : "silent cinematic product shot")")
                    .font(WebTheme.Font.body(11))
                    .foregroundColor(.white.opacity(0.35))
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 28)
        }
        .background(Color(hex: "101014").ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .onAppear { chatVM.blueprintError = nil }
    }

    // MARK: - Header (identity gradient + name/tagline)

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: blueprint.hasCreator ? "person.fill" : "cube.box.fill")
                    .font(.system(size: 9, weight: .semibold))
                Text(blueprint.format.uppercased())
                    .font(WebTheme.Font.body(10, weight: .semibold))
                    .tracking(1.0)
            }
            .foregroundColor(.white.opacity(0.6))

            Text(blueprint.name)
                .font(WebTheme.Font.display(24, weight: .bold))
                .foregroundColor(.white)
                .tracking(-0.3)
            Text(blueprint.tagline)
                .font(WebTheme.Font.body(14))
                .foregroundColor(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.top, 28)
        .padding(.bottom, 18)
        .background(
            LinearGradient(
                colors: [accent1.opacity(0.28), Color.clear, accent2.opacity(0.3)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        )
        .padding(.horizontal, -18)
    }

    // MARK: - Product photo (the only required input)

    private var photoDrop: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("YOUR PRODUCT PHOTO").webSectionLabel()
            PhotosPicker(selection: $pickerItem, matching: .images) {
                ZStack {
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .fill(Color.white.opacity(0.03))
                    if let img = productImage {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFit()
                            .padding(6)
                    } else {
                        VStack(spacing: 8) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
                            Text("Drop in your product photo")
                                .font(WebTheme.Font.body(14))
                                .foregroundColor(.white.opacity(0.6))
                            Text("That's all this template needs")
                                .font(WebTheme.Font.body(11))
                                .foregroundColor(.white.opacity(0.35))
                        }
                    }
                    if uploading {
                        Color.black.opacity(0.55)
                            .clipShape(RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous))
                        ProgressView().tint(.white)
                    }
                }
                .frame(height: 170)
                .overlay(
                    RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                        .strokeBorder(
                            Color.white.opacity(0.15),
                            style: StrokeStyle(lineWidth: 1, dash: [5, 4])
                        )
                )
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { await handlePicked(item) }
            }
        }
    }

    // MARK: - Optional fields

    private var fields: some View {
        VStack(spacing: 12) {
            WebModalField(text: $productName, placeholder: "Product name (recommended)")
            if blueprint.creatorSpeaks {
                WebModalField(
                    text: $productDescription,
                    placeholder: "One line about it — we write the script (optional)"
                )
            }
        }
    }

    // MARK: - Generate

    private var generateButton: some View {
        Button {
            guard let url = remoteUrl else { return }
            chatVM.startBlueprintGeneration(
                blueprint,
                productImageUrl: url,
                productName: productName,
                productDescription: productDescription
            )
        } label: {
            HStack(spacing: 8) {
                if chatVM.isGenerating {
                    ProgressView().tint(.black).scaleEffect(0.8)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 13, weight: .semibold))
                }
                Text("Generate — \(credits) credits")
                    .font(WebTheme.Font.body(15, weight: .semibold))
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .fill(Color.white)
            )
            .opacity(remoteUrl == nil || uploading || chatVM.isGenerating ? 0.4 : 1)
        }
        .buttonStyle(WebPressStyle())
        .disabled(remoteUrl == nil || uploading || chatVM.isGenerating)
    }

    // MARK: - Upload

    private func handlePicked(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let img = UIImage(data: data) else { return }
        await MainActor.run {
            productImage = img
            remoteUrl = nil
            uploading = true
            uploadError = nil
            pickerItem = nil
        }
        do {
            // Same moderated chokepoint the composer/form use — a rejected
            // image never enters the pipeline.
            let url = try await UGCService.shared.uploadAttachment(img)
            await MainActor.run {
                remoteUrl = url
                uploading = false
            }
        } catch {
            await MainActor.run {
                productImage = nil
                uploading = false
                if case APIError.custom(let msg) = error, !msg.isEmpty {
                    uploadError = msg
                } else {
                    uploadError = "Upload failed — try another photo."
                }
            }
        }
    }
}

// MARK: - Single-line field styled like the web modal inputs

private struct WebModalField: View {
    @Binding var text: String
    let placeholder: String

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(.white.opacity(0.3)))
            .font(WebTheme.Font.body(14))
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .fill(Color.white.opacity(0.04))
            )
            .overlay(
                RoundedRectangle(cornerRadius: WebTheme.Radius.btn, style: .continuous)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    }
}
