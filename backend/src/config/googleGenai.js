/**
 * Google GenAI (the NEW unified `@google/genai` SDK) client.
 *
 * Separate from `config/gemini.js`, which uses the OLDER
 * `@google/generative-ai` SDK for script/text work. The new SDK is required
 * for the Interactions API that powers Gemini Omni Flash video generation
 * (`ai.interactions.create`) — that surface does not exist on the old SDK.
 *
 * Auth: Gemini API (not Vertex), keyed by the same GEMINI_API_KEY the rest of
 * the backend already uses. Null when no key is configured so callers can
 * degrade gracefully / fall back to a mock.
 */
const { GoogleGenAI } = require('@google/genai');

// Prefer a dedicated Omni key so it never collides with GEMINI_API_KEY (the
// AI-Studio key config/gemini.js uses for script/text work). Falls back to the
// shared key if a dedicated one isn't set.
const apiKey =
  process.env.GEMINI_OMNI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';
const genai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Public-preview model id for Omni Flash video generation.
const OMNI_VIDEO_MODEL = 'gemini-omni-flash-preview';

function isGenaiEnabled() {
  return !!genai;
}

module.exports = { genai, isGenaiEnabled, OMNI_VIDEO_MODEL };
