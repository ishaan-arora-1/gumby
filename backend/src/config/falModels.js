/**
 * Central registry of the fal.ai model endpoints we use across Gumby's
 * pipelines. Versions are pinned here so we can bump them in exactly one
 * place when fal ships a new generation of any of the underlying models.
 *
 * Currently in use:
 *   - KLING_IMAGE_TO_VIDEO       — animate a still portrait into a 5s talking
 *                                  clip (used by `scripts/generate-templates.js`)
 *   - KLING_TEXT_TO_VIDEO        — generate a 5s talking-head clip purely from
 *                                  a text prompt (used by
 *                                  `scripts/generate-templates-from-text.js`)
 *   - ELEVENLABS_TTS             — convert a user-approved script into speech
 *                                  (used by `services/ugcPipeline.js`)
 *   - SYNC_LIPSYNC               — overlay the TTS audio onto the chosen
 *                                  template video so the actor's mouth lines
 *                                  up with the new script
 *                                  (used by `services/ugcPipeline.js`)
 */

module.exports = {
  // Kling Video v3 Pro — top-tier image-to-video. Inherits aspect from the
  // input image. We disable native audio because the lip-sync step layers
  // ElevenLabs TTS on top.
  KLING_IMAGE_TO_VIDEO: 'fal-ai/kling-video/v3/pro/image-to-video',

  // Kling Video 2.6 Pro — cinematic text-to-video with explicit
  // duration/aspect controls. Same audio rule: keep clips silent so we can
  // dub them at use-time.
  KLING_TEXT_TO_VIDEO: 'fal-ai/kling-video/v2.6/pro/text-to-video',

  // ElevenLabs multilingual TTS exposed via fal.ai. Voice IDs are the
  // ElevenLabs library names (Rachel, Bella, Adam, ...).
  ELEVENLABS_TTS: 'fal-ai/elevenlabs/tts/multilingual-v2',

  // Generic audio→video lip-sync. Takes a video URL and an audio URL and
  // produces a new video where the actor's mouth tracks the audio.
  SYNC_LIPSYNC: 'fal-ai/sync-lipsync/v2',
};
