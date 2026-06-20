import SwiftUI
import UIKit

/// A `UITextView`-backed multiline editor used in place of SwiftUI's
/// `TextEditor`.
///
/// `TextEditor` has a long-standing rendering bug where the typed text
/// intermittently loses its color and goes INVISIBLE after edits such as
/// backspacing, only reappearing when the field is re-selected / the text is
/// highlighted. Moving the composer's drop-shadow off the text's ancestor
/// reduced it but did not eliminate it — the bug is intrinsic to TextEditor.
///
/// Owning the `UITextView` directly lets us re-pin `textColor` (and the font)
/// on every update cycle, so the color can never be silently dropped.
struct WebUITextView: UIViewRepresentable {
    @Binding var text: String
    var fontName: String = "Inter-Regular"
    var fontSize: CGFloat = 14
    var textColor: UIColor = .white
    var tintColor: UIColor = .white
    /// Inner text insets. Defaults mirror SwiftUI's `TextEditor` so existing
    /// placeholder overlays stay aligned.
    var contentInset: UIEdgeInsets = UIEdgeInsets(top: 8, left: 5, bottom: 8, right: 5)
    /// `true` → fixed frame, scrolls internally (composer). `false` → grows
    /// with content like `TextEditor(minHeight:)` (the form's script box).
    var isScrollEnabled: Bool = true
    /// Optional bridge to a SwiftUI `@FocusState` so callers keep the same
    /// focus API (programmatic dismiss + focus-driven border highlight).
    var focus: FocusState<Bool>.Binding? = nil

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        tv.backgroundColor = .clear
        tv.textColor = textColor
        tv.tintColor = tintColor
        tv.font = Self.resolvedFont(fontName, fontSize)
        tv.textContainerInset = contentInset
        tv.textContainer.lineFragmentPadding = 0
        tv.isScrollEnabled = isScrollEnabled
        tv.keyboardDismissMode = .interactive
        tv.text = text
        return tv
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        context.coordinator.parent = self

        if uiView.text != text { uiView.text = text }

        // The whole reason this type exists: re-pin colour + font every cycle
        // so SwiftUI can never leave the text rendered with no colour.
        uiView.textColor = textColor
        uiView.tintColor = tintColor
        uiView.font = Self.resolvedFont(fontName, fontSize)

        if !isScrollEnabled { uiView.invalidateIntrinsicContentSize() }

        // Bridge @FocusState → first responder (deferred to avoid mutating
        // state mid-update).
        if let focus = focus {
            let wantFocus = focus.wrappedValue
            if wantFocus, !uiView.isFirstResponder {
                DispatchQueue.main.async { uiView.becomeFirstResponder() }
            } else if !wantFocus, uiView.isFirstResponder {
                DispatchQueue.main.async { uiView.resignFirstResponder() }
            }
        }
    }

    private static func resolvedFont(_ name: String, _ size: CGFloat) -> UIFont {
        UIFont(name: name, size: size) ?? .systemFont(ofSize: size)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: WebUITextView
        init(_ parent: WebUITextView) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            guard let focus = parent.focus, focus.wrappedValue == false else { return }
            DispatchQueue.main.async { focus.wrappedValue = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            guard let focus = parent.focus, focus.wrappedValue == true else { return }
            DispatchQueue.main.async { focus.wrappedValue = false }
        }
    }
}
