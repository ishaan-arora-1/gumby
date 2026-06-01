import SwiftUI

/// Web's `bg-elevated rounded-pill p-0.5` segmented toggle — used for the
/// aspect-ratio (9:16 / 1:1 / 16:9) and duration (5s / 10s) chips in the
/// prompt composer. Selected option fills white; unselected stays muted.
struct WebSegmentedPill<Value: Hashable>: View {
    let options: [Value]
    @Binding var selection: Value
    let label: (Value) -> String

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { opt in
                Button {
                    selection = opt
                } label: {
                    Text(label(opt))
                        .font(.custom("Inter-SemiBold", size: 11))
                        .foregroundColor(opt == selection ? .black : .white.opacity(0.6))
                        .padding(.horizontal, 8)
                        .frame(height: 24)
                        .background(
                            Capsule(style: .continuous)
                                .fill(opt == selection ? Color.white : Color.clear)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(
            Capsule(style: .continuous).fill(WebTheme.Color.elevated)
        )
    }
}
