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
    ]

    static let defaultId: String = "bold"

    static func get(_ id: String?) -> CaptionPreset {
        if let id, let match = all.first(where: { $0.id == id }) { return match }
        return all.first(where: { $0.id == defaultId }) ?? all[0]
    }
}
