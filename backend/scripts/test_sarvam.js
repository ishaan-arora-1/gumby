#!/usr/bin/env node
/**
 * Sarvam TTS smoke test — verifies the request/response shape against your
 * real key before the pipeline depends on it.
 *
 *   cd backend && node scripts/test_sarvam.js
 *   cd backend && node scripts/test_sarvam.js "नमस्ते, यह एक टेस्ट है" hi ritu
 *
 * Writes /tmp/sarvam_test.wav on success so you can play it.
 */
require('dotenv').config();
const fs = require('fs');
const sarvam = require('../src/config/sarvam');

async function main() {
  const text = process.argv[2] || 'Hey guys, honestly main is product se obsessed ho gayi hoon. You need to try it!';
  const language = process.argv[3] || 'hi';
  const speaker = process.argv[4] || 'ritu';

  console.log('SARVAM_API_KEY present:', !!process.env.SARVAM_API_KEY);
  console.log('Defaults:', sarvam.defaults());
  if (!process.env.SARVAM_API_KEY) {
    console.error('\n❌ SARVAM_API_KEY not set in backend/.env — add it (dashboard.sarvam.ai) and re-run.');
    process.exit(1);
  }

  console.log(`\nSarvam TTS  speaker=${speaker}  lang=${language}\n  text: ${JSON.stringify(text)}`);
  try {
    const { buffer, contentType } = await sarvam.generateTts(text, { speaker, language });
    fs.writeFileSync('/tmp/sarvam_test.wav', buffer);
    console.log('\n✅ Sarvam TTS OK');
    console.log('   content-type:', contentType);
    console.log('   bytes       :', buffer.length, buffer.length > 5 * 1024 * 1024 ? '(⚠️ >5MB — too big for Kling LipSync)' : '');
    console.log('   saved to    : /tmp/sarvam_test.wav  (play it to hear the voice)');
  } catch (err) {
    console.error('\n❌ Sarvam TTS FAILED:', err?.message || err);
    process.exit(1);
  }
}
main();
