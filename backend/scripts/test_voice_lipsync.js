#!/usr/bin/env node
/**
 * Standalone voice + lip-sync smoke test — isolates the two fal models the
 * pipeline depends on, so we can see exactly which one (if any) your FAL_KEY
 * can't reach. No full generation needed.
 *
 *   cd backend && node scripts/test_voice_lipsync.js
 *   cd backend && node scripts/test_voice_lipsync.js "<public-video-url>"   # also test lip-sync
 *
 * Step 1 always runs: fal ElevenLabs TTS → prints the audio url or the error.
 * Step 2 runs only if you pass a public video url (e.g. paste the silent clip
 * url from your last job): Kling LipSync(video, audio) → prints url or error.
 */
require('dotenv').config();
const { fal, isFalEnabled } = require('../src/config/fal');
const { ELEVENLABS_TTS, KLING_LIPSYNC } = require('../src/config/falModels');

async function main() {
  console.log('FAL_KEY set:', isFalEnabled());
  if (!isFalEnabled()) {
    console.error('❌ FAL_KEY not set in backend/.env');
    process.exit(1);
  }

  // ---- Step 1: ElevenLabs TTS ----
  let audioUrl = null;
  console.log('\n[1] fal ElevenLabs TTS …');
  try {
    const r = await fal.subscribe(ELEVENLABS_TTS, {
      input: { text: 'Hey, this is a test of the Blink voice. Can you hear me?', voice: 'Rachel', stability: 0.5, similarity_boost: 0.75 },
      logs: false,
    });
    audioUrl = r?.data?.audio?.url || r?.audio?.url || null;
    if (!audioUrl) throw new Error('no audio.url in response: ' + JSON.stringify(r).slice(0, 300));
    console.log('   ✅ audio:', audioUrl);
  } catch (e) {
    console.error('   ❌ ElevenLabs TTS FAILED:', e?.message || e);
    console.error('   → If this is 403/forbidden, your fal account does not have this model enabled (enable it / add billing at fal.ai). THIS would be why videos ship silent.');
    process.exit(1);
  }

  // ---- Step 2: Kling LipSync (only if a video url was provided) ----
  const videoUrl = process.argv[2];
  if (!videoUrl) {
    console.log('\n[2] Kling LipSync — skipped (pass a public video url as an arg to test it).');
    console.log('\n✅ TTS works. If your videos are still silent, the failure is in the Kling LipSync call or the pipeline wiring — paste a silent-clip url as an arg to test lip-sync directly.');
    return;
  }
  console.log('\n[2] Kling LipSync …');
  try {
    const r = await fal.subscribe(KLING_LIPSYNC, {
      input: { video_url: videoUrl, audio_url: audioUrl },
      logs: false,
    });
    const out = r?.data?.video?.url || r?.video?.url || null;
    if (!out) throw new Error('no video.url in response: ' + JSON.stringify(r).slice(0, 300));
    console.log('   ✅ lip-synced video:', out);
    console.log('\n✅ Both models work with your key.');
  } catch (e) {
    console.error('   ❌ Kling LipSync FAILED:', e?.message || e);
    console.error('   → Common: video must be 2–10s, 720–1920px, ≤100MB. If your clip is outside that, lip-sync rejects it.');
    process.exit(1);
  }
}

main();
