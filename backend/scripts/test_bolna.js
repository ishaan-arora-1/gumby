#!/usr/bin/env node
/**
 * Standalone Bolna TTS smoke test — isolates the voice step from the whole
 * pipeline so we can see exactly why the Bolna path is falling back to a
 * silent clip.
 *
 *   cd backend && node scripts/test_bolna.js "optional custom text"
 *
 * Prints: whether the key is set, the exact request, and either the audio
 * bytes/content-type (success) or the raw error/status (failure). On success
 * it writes /tmp/bolna_test.mp3 so you can play it.
 */
require('dotenv').config();
const fs = require('fs');
const bolna = require('../src/config/bolna');

async function main() {
  const text = process.argv[2] || 'Hey, this is a quick test of the Blink voice. Can you hear me clearly?';

  // Test the key directly — do NOT gate on isEnabled() (which also requires
  // BOLNA_TTS_ENABLED); this script's job is to check the key + endpoint.
  console.log('BOLNA_API_KEY present:', !!process.env.BOLNA_API_KEY);
  console.log('Defaults:', bolna.defaults());
  if (!process.env.BOLNA_API_KEY) {
    console.error('\n❌ BOLNA_API_KEY is not set in backend/.env.');
    process.exit(1);
  }

  console.log('\nCalling Bolna TTS with text:', JSON.stringify(text));
  try {
    const { buffer, contentType } = await bolna.generateTts(text);
    const out = '/tmp/bolna_test.' + (/wav/i.test(contentType) ? 'wav' : 'mp3');
    fs.writeFileSync(out, buffer);
    console.log('\n✅ Bolna TTS OK');
    console.log('   content-type:', contentType);
    console.log('   bytes       :', buffer.length, buffer.length > 5 * 1024 * 1024 ? '(⚠️ >5MB — too big for Kling LipSync)' : '');
    console.log('   saved to    :', out, '(play it to verify the voice)');
  } catch (err) {
    console.error('\n❌ Bolna TTS FAILED');
    console.error('   ', err?.message || err);
    console.error('\nThis is the same error the pipeline swallows. Common causes:');
    console.error('  - 403 / "enterprise only": the TTS-sample API is gated; your key lacks access.');
    console.error('  - 404 / wrong endpoint: the /user/tts_sample path or request shape differs from what we assumed.');
    console.error('  - provider/voice mismatch: BOLNA_TTS_PROVIDER / BOLNA_TTS_VOICE not valid for your account.');
    process.exit(1);
  }
}

main();
