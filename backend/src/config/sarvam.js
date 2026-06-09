/**
 * Sarvam TTS (Bulbul v3) client — Indian-language + Hinglish voice synthesis.
 *
 * Direct REST API (no Bolna, no gating). Bulbul v3 is purpose-built for
 * code-mixed Hinglish and 11 Indian languages. We use it as the primary voice
 * source for the lip-sync pipeline:
 *   silent Kling i2v → Sarvam TTS (this) → Kling LipSync.
 *
 * Env:
 *   SARVAM_API_KEY        (required to enable) — from dashboard.sarvam.ai.
 *   SARVAM_TTS_SPEAKER    (optional) — lowercase v3 speaker, default "ritu".
 *   SARVAM_TTS_LANGUAGE   (optional) — target_language_code, default "hi-IN".
 *   SARVAM_TTS_SAMPLE_RATE(optional) — default 24000 (24 kHz).
 *
 * Notes:
 *   - Speaker names are case-sensitive and must be LOWERCASE.
 *   - For Hindi, write the text in Devanagari for best pronunciation. Hinglish
 *     (code-mixed) is handled natively; Hindi words still read best in
 *     Devanagari.
 *   - REST limit is 2500 chars/request (our scripts are far shorter).
 *   - Response is { audios: ["<base64>"] }.
 */

const TTS_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
const MODEL = 'bulbul:v3';

// Curated v3 speakers surfaced in the UI (mix of female/male, Hindi-strong).
const SPEAKERS = [
  { id: 'ritu', label: 'Ritu', gender: 'female' },
  { id: 'priya', label: 'Priya', gender: 'female' },
  { id: 'neha', label: 'Neha', gender: 'female' },
  { id: 'shreya', label: 'Shreya', gender: 'female' },
  { id: 'shubh', label: 'Shubh', gender: 'male' },
  { id: 'aditya', label: 'Aditya', gender: 'male' },
  { id: 'rahul', label: 'Rahul', gender: 'male' },
  { id: 'amit', label: 'Amit', gender: 'male' },
];
const SPEAKER_IDS = new Set(SPEAKERS.map((s) => s.id));

// Map the form's short language codes to Sarvam target_language_code.
const LANG_MAP = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN',
  bn: 'bn-IN', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', pa: 'pa-IN', od: 'od-IN',
};

function getApiKey() {
  return process.env.SARVAM_API_KEY || '';
}
function isEnabled() {
  return Boolean(getApiKey());
}
function defaults() {
  return {
    speaker: process.env.SARVAM_TTS_SPEAKER || 'ritu',
    language: process.env.SARVAM_TTS_LANGUAGE || 'hi-IN',
    sampleRate: Number(process.env.SARVAM_TTS_SAMPLE_RATE) || 24000,
  };
}
function listSpeakers() {
  return SPEAKERS;
}
function toLangCode(lang) {
  if (!lang) return null;
  if (/^[a-z]{2}-IN$/i.test(lang)) return lang; // already a full code
  return LANG_MAP[lang.toLowerCase()] || null;
}

/**
 * Generate speech. Returns { buffer, contentType }.
 *   opts: { speaker, language ('hi'|'hi-IN'|...), sampleRate, pace }
 */
async function generateTts(text, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SARVAM_API_KEY is not set');
  const clean = (text || '').trim();
  if (!clean) throw new Error('Sarvam TTS: text is empty');
  if (clean.length > 2500) throw new Error('Sarvam TTS: text exceeds 2500 chars');

  const d = defaults();
  const speaker = (opts.speaker && SPEAKER_IDS.has(opts.speaker) ? opts.speaker : d.speaker);
  const target_language_code = toLangCode(opts.language) || d.language;
  const speech_sample_rate = Number(opts.sampleRate) || d.sampleRate;

  const body = {
    text: clean,
    target_language_code,
    speaker,
    model: MODEL,
    pace: opts.pace || 1.0,
    speech_sample_rate,
  };

  const resp = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 500); } catch {}
    throw new Error(`Sarvam TTS failed (${resp.status}): ${detail}`);
  }

  const json = await resp.json();
  const b64 = Array.isArray(json.audios) ? json.audios[0] : (json.audio || null);
  if (!b64) throw new Error('Sarvam TTS: no audio in response');
  // Default codec is WAV. Kling LipSync accepts wav/mp3.
  return { buffer: Buffer.from(b64, 'base64'), contentType: 'audio/wav' };
}

module.exports = {
  isEnabled,
  generateTts,
  defaults,
  listSpeakers,
  toLangCode,
  SPEAKER_IDS,
};
