import Foundation
import SwiftUI

/// Caption style preset — MIRROR of
/// backend/src/services/captionPresets.js and
/// web/lib/captionPresets.ts.
///
/// If you add a preset here, add it to BOTH JS files too. The `font`
/// string must match the family name registered via UIAppFonts in
/// Info.plist (which itself must match the family name inside the .ttf
/// — Roboto-Black.ttf reports "Roboto Black", Anton-Regular.ttf reports
/// "Anton").
struct CaptionPreset: Identifiable, Hashable {
    let id: String
    let label: String
    let description: String

    let font: String         // CIText font family name
    let fontSize: CGFloat    // px, in the 1080-wide design canvas
    let fillColor: Color
    let outlineColor: Color
    let outlineWidthPx: CGFloat
    let shadowColor: Color
    let shadowAlpha: Double
    let shadowDyPx: CGFloat
    let positionYRatio: CGFloat

    let popFromPct: CGFloat
    let popPeakPct: CGFloat
    let popSettlePct: CGFloat
    let popInMs: Int
    let popSettleMs: Int

    // Optional block-style fields. When `boxBgColor` is set the preview
    // switches from outline mode to an opaque rectangle behind the text.
    var boxBgColor: Color? = nil
    var boxBgAlpha: Double = 1
    var boxPaddingPx: CGFloat = 10
    // Italic flag. Synthesized from the regular font face — no separate
    // italic .ttf is bundled.
    var italic: Bool = false

    static let all: [CaptionPreset] = [
        CaptionPreset(
            id: "bold",
            label: "Bold",
            description: "White & punchy. The default UGC look.",
            font: "Roboto Black",
            fontSize: 72,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 4,
            shadowColor: .black,
            shadowAlpha: 0.5,
            shadowDyPx: 2,
            positionYRatio: 0.76,
            popFromPct: 85,
            popPeakPct: 106,
            popSettlePct: 100,
            popInMs: 80,
            popSettleMs: 80
        ),
        CaptionPreset(
            id: "hype",
            label: "Hype",
            description: "Tall & loud. Viral TikTok energy.",
            font: "Anton",
            fontSize: 96,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 5,
            shadowColor: .black,
            shadowAlpha: 0.5,
            shadowDyPx: 3,
            positionYRatio: 0.76,
            popFromPct: 80,
            popPeakPct: 112,
            popSettlePct: 100,
            popInMs: 90,
            popSettleMs: 100
        ),
        CaptionPreset(
            id: "clean",
            label: "Clean",
            description: "Smaller, no shadow. Editorial restraint.",
            font: "Roboto Black",
            fontSize: 56,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 2,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.78,
            popFromPct: 92,
            popPeakPct: 102,
            popSettlePct: 100,
            popInMs: 60,
            popSettleMs: 60
        ),

        // MARK: - Outline variants

        CaptionPreset(
            id: "yellow",
            label: "Yellow",
            description: "Bright yellow text, black outline. MrBeast / YouTube auto-caption energy.",
            font: "Roboto Black",
            fontSize: 72,
            fillColor: Color(red: 0xFA/255, green: 0xCC/255, blue: 0x15/255),
            outlineColor: .black,
            outlineWidthPx: 5,
            shadowColor: .black,
            shadowAlpha: 0.5,
            shadowDyPx: 2,
            positionYRatio: 0.76,
            popFromPct: 85,
            popPeakPct: 106,
            popSettlePct: 100,
            popInMs: 80,
            popSettleMs: 80
        ),
        CaptionPreset(
            id: "italic_bold",
            label: "Italic",
            description: "Bold white text in italic — leans forward for energy.",
            font: "Roboto Black",
            fontSize: 72,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 4,
            shadowColor: .black,
            shadowAlpha: 0.5,
            shadowDyPx: 2,
            positionYRatio: 0.76,
            popFromPct: 85,
            popPeakPct: 106,
            popSettlePct: 100,
            popInMs: 80,
            popSettleMs: 80,
            italic: true
        ),

        // MARK: - Block / box variants

        CaptionPreset(
            id: "block_black",
            label: "Block Black",
            description: "White text on a solid black box. Classic TV-news subtitle.",
            font: "Roboto Black",
            fontSize: 64,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 0,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.76,
            popFromPct: 90,
            popPeakPct: 104,
            popSettlePct: 100,
            popInMs: 70,
            popSettleMs: 70,
            boxBgColor: .black,
            boxBgAlpha: 0.85,
            boxPaddingPx: 10
        ),
        CaptionPreset(
            id: "block_blue",
            label: "Block Blue",
            description: "White text on a blue brand-accent box. Modern, ownable.",
            font: "Roboto Black",
            fontSize: 64,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 0,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.76,
            popFromPct: 90,
            popPeakPct: 104,
            popSettlePct: 100,
            popInMs: 70,
            popSettleMs: 70,
            boxBgColor: Color(red: 0x3B/255, green: 0x82/255, blue: 0xF6/255),
            boxBgAlpha: 1,
            boxPaddingPx: 10
        ),
        CaptionPreset(
            id: "block_yellow",
            label: "Block Yellow",
            description: "Black text on a bright yellow box. Highlighter pop.",
            font: "Roboto Black",
            fontSize: 64,
            fillColor: Color(red: 0x0A/255, green: 0x0A/255, blue: 0x0A/255),
            outlineColor: .black,
            outlineWidthPx: 0,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.76,
            popFromPct: 90,
            popPeakPct: 104,
            popSettlePct: 100,
            popInMs: 70,
            popSettleMs: 70,
            boxBgColor: Color(red: 0xFA/255, green: 0xCC/255, blue: 0x15/255),
            boxBgAlpha: 1,
            boxPaddingPx: 10
        ),
        CaptionPreset(
            id: "pink_pop",
            label: "Pink Pop",
            description: "White text on a hot pink box. Beauty / lifestyle creator vibe.",
            font: "Roboto Black",
            fontSize: 64,
            fillColor: .white,
            outlineColor: .black,
            outlineWidthPx: 0,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.76,
            popFromPct: 90,
            popPeakPct: 104,
            popSettlePct: 100,
            popInMs: 70,
            popSettleMs: 70,
            boxBgColor: Color(red: 0xEC/255, green: 0x48/255, blue: 0x99/255),
            boxBgAlpha: 1,
            boxPaddingPx: 10
        ),
        CaptionPreset(
            id: "block_white",
            label: "Block White",
            description: "Black text on a clean white box. Newspaper / editorial.",
            font: "Roboto Black",
            fontSize: 64,
            fillColor: Color(red: 0x0A/255, green: 0x0A/255, blue: 0x0A/255),
            outlineColor: .black,
            outlineWidthPx: 0,
            shadowColor: .black,
            shadowAlpha: 0,
            shadowDyPx: 0,
            positionYRatio: 0.76,
            popFromPct: 90,
            popPeakPct: 104,
            popSettlePct: 100,
            popInMs: 70,
            popSettleMs: 70,
            boxBgColor: .white,
            boxBgAlpha: 1,
            boxPaddingPx: 10
        ),
    ]

    static let defaultId: String = "bold"

    static func get(_ id: String?) -> CaptionPreset {
        if let id, let match = all.first(where: { $0.id == id }) { return match }
        return all.first(where: { $0.id == defaultId }) ?? all[0]
    }
}
