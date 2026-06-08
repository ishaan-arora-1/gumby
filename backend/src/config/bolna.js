/**
 * Bolna TTS client.
 *
 * Bolna is primarily a conversational voice-agent platform, but it exposes a
 * standalone "Generate TTS Sample" endpoint that wraps 20+ TTS providers
 * (ElevenLabs, Cartesia, Sarvam, AzureTTS) — useful for controllable and
 * Indian-language voices that Kling's inline audio can't do.
 *
 * We use it as the voice source for the lip-sync pipeline:
 *   silent Kling i2v  →  Bolna TTS (this)  →  Kling LipSync (audio-to-video)
 *
 * Env:
 *   BOLNA_API_KEY        (required to enable) — Bearer token from the Bolna
 *                        dashboard → Developers → API Keys.
 *   BOLNA_TTS_PROVIDER   (optional) — e.g. "elevenlabs" | "sarvam" | "cartesia"
 *                        | "polly". Default "elevenlabs".
 *   BOLNA_TTS_VOICE      (optional) — provider-specific voice id/name.
 *   BOLNA_TTS_MODEL      (optional) — provider model/engine.
 *   BOLNA_TTS_LANGUAGE   (optional) — e.g. "en", "hi", "ta". Default "en".
 *
 * NOTE: the TTS-sample API is documented as "live for Enterprises only", so a
 * non-enterprise key may 403. The whole Bolna voice path is gated by
 * isEnabled() and the pipeline falls back to Kling inline audio when it's off,
 * so this never breaks the existing flow.
 *
 * The exact response shape (audio URL vs raw bytes) isn't fully documented, so
 * generateTts() handles BOTH: it returns { buffer, contentType } that the
 * caller uploads to storage to obtain the public URL Kling LipSync needs.
 */

const TTS_ENDPOINT = 'https://api.bolna.ai/user/tts_sample';

function getApiKey() {
  return process.env.BOLNA_API_KEY || '';
}

function isEnabled() {
  return Boolean(getApiKey());
}

function defaults() {
  return {
    provider: process.env.BOLNA_TTS_PROVIDER || 'elevenlabs',
    voice: process.env.BOLNA_TTS_VOICE || 'Monika',
    model: process.env.BOLNA_TTS_MODEL || 'eleven_turbo_v2_5',
    language: process.env.BOLNA_TTS_LANGUAGE || 'en',
  };
}

/**
 * Generate speech for `text`. Returns the raw audio bytes + content type so
 * the caller can persist them and hand Kling LipSync a public URL.
 *
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function generateTts(text, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('BOLNA_API_KEY is not set');
  const clean = (text || '').trim();
  if (!clean) throw new Error('Bolna TTS: text is empty');

  const d = defaults();
  const provider = opts.provider || d.provider;
  const voice = opts.voice || d.voice;
  const model = opts.model || d.model;
  const language = opts.language || d.language;

  const body = {
    text: clean,
    provider,
    provider_config: {
      voice,
      model,
      language,
    },
  };

  const resp = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.text()).slice(0, 500); } catch {}
    throw new Error(`Bolna TTS failed (${resp.status}): ${detail}`);
  }

  const ct = (resp.headers.get('content-type') || '').toLowerCase();

  // Case A — JSON response carrying a URL (or base64). Fetch/decode to bytes.
  if (ct.includes('application/json')) {
    const json = await resp.json();
    const url =
      json.audio_url || json.url || json.data?.audio_url || json.data?.url || null;
    if (url) {
      const audioResp = await fetch(url);
      if (!audioResp.ok) {
        throw new Error(`Bolna TTS: could not fetch returned audio url (${audioResp.status})`);
      }
      const audioCt = audioResp.headers.get('content-type') || 'audio/mpeg';
      return { buffer: Buffer.from(await audioResp.arrayBuffer()), contentType: audioCt };
    }
    const b64 = json.audio || json.audio_base64 || json.data?.audio || null;
    if (b64) {
      return { buffer: Buffer.from(b64, 'base64'), contentType: 'audio/mpeg' };
    }
    throw new Error('Bolna TTS: JSON response had no audio url/base64');
  }

  // Case B — raw audio bytes (audio/mpeg, audio/wav, ...).
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType: ct || 'audio/mpeg' };
}

module.exports = {
  isEnabled,
  generateTts,
  defaults,
};
