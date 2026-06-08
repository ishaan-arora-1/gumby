/**
 * Central registry of the fal.ai model endpoints we use across "Blinkugc"'s
 * pipeline. The full ad flow is now exactly two API calls:
 *
 *   1. IMAGE_SUBJECT_SWAP  — Nano Banana Pro takes the user's inspiration
 *                            photo (and optionally the product photo) and
 *                            synthesizes a single still where a brand-new
 *                            model occupies the same scene, optionally
 *                            holding the user's product pixel-perfectly.
 *   2. KLING_IMAGE_TO_VIDEO — Kling 3.0 Pro turns that still into the final
 *                            video, with `generate_audio: true` so the model
 *                            speaks the script aloud and lip-syncs to it. No
 *                            separate TTS, no separate lip-sync step.
 *
 *   KLING_TEXT_TO_VIDEO    — Fallback only, used when the user provides no
 *                            inspiration image and no template (pure prompt).
 */

module.exports = {
  // Kling Video v3 Pro — image-to-video with built-in audio + lip-sync.
  // We always pass `generate_audio: true` and embed the script in the prompt
  // so Kling renders the speaking model in one shot.
  KLING_IMAGE_TO_VIDEO: 'fal-ai/kling-video/v3/pro/image-to-video',

  // Kling Video v3 Pro — text-to-video fallback when there's no seed image.
  KLING_TEXT_TO_VIDEO: 'fal-ai/kling-video/v3/pro/text-to-video',

  // Nano Banana Pro (Google Gemini 3 Pro Image) — semantic image EDITING.
  // Used whenever we have at least one input image (inspiration photo,
  // product photo, or both). Replaces the person in the scene with the
  // described creator while preserving environment + product.
  IMAGE_SUBJECT_SWAP: 'fal-ai/nano-banana-pro/edit',

  // Nano Banana Pro — text-to-image GENERATION. Used when the user gave
  // us neither an inspiration photo nor a product photo: we synthesize
  // a fresh creator-in-scene still purely from the prompt so Kling
  // image-to-video still has a seed frame to work from.
  IMAGE_GENERATE: 'fal-ai/nano-banana-pro',

  // Kling LipSync (audio-to-video) — drives the mouth of an existing video
  // from an external audio track. Used by the Bolna voice path: we render a
  // SILENT Kling i2v clip, generate the voice with Bolna TTS, then lip-sync
  // the silent clip to that audio here. Input: { video_url, audio_url }.
  // Audio must be a public <5MB mp3/wav/m4a, 2–60s. ~$0.014/sec.
  KLING_LIPSYNC: 'fal-ai/kling-video/lipsync/audio-to-video',
};
