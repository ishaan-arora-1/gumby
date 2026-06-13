/**
 * Image moderation — gatekeeps user-uploaded reference photos before they
 * enter the generation pipeline.
 *
 * Uses OpenAI's `omni-moderation-latest`, which accepts images and returns
 * per-category scores. We block on sexual content (nudity / pornography)
 * and hard-block on sexual/minors. This is the "I own the rights + no
 * nudity" gate, matching the pattern sites like Higgs Field use.
 *
 * Free to call (OpenAI does not bill moderation), low-latency (~hundreds
 * of ms), and reuses the OPENAI_API_KEY we already have configured.
 *
 * Failure policy:
 *   - A definitive FLAGGED result always blocks.
 *   - If the moderation call itself errors (network, key missing, OpenAI
 *     down), we FAIL OPEN by default (allow the upload, log a warning) so a
 *     transient outage doesn't take the whole uploader down. Set
 *     MODERATION_FAIL_CLOSED=true to flip this to fail-closed (reject on
 *     any moderation error) once you want the stricter posture in prod.
 */
const { openai } = require('../config/openai');

const MODEL = 'omni-moderation-latest';

// Categories that block an upload. `sexual` covers nudity / explicit
// content; `sexual/minors` is a hard block regardless of anything else.
const BLOCK_CATEGORIES = ['sexual', 'sexual/minors'];

function failClosed() {
  return String(process.env.MODERATION_FAIL_CLOSED || '').toLowerCase() === 'true';
}

function isEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Moderate a single base64 image.
 *
 * @param {object} args
 * @param {string} args.base64       Raw base64 (no data: prefix).
 * @param {string} [args.contentType] MIME type; defaults to image/png.
 * @returns {Promise<{ allowed: boolean, flaggedCategories: string[], reason: string|null }>}
 */
async function moderateImageBase64({ base64, contentType }) {
  if (!base64) {
    // Nothing to check — let the caller's own validation handle it.
    return { allowed: true, flaggedCategories: [], reason: null };
  }
  if (!isEnabled()) {
    // No key configured. Fail open unless explicitly told to fail closed.
    if (failClosed()) {
      return {
        allowed: false,
        flaggedCategories: [],
        reason: 'Image moderation is unavailable right now. Please try again later.',
      };
    }
    console.warn('[moderation] OPENAI_API_KEY missing — skipping image moderation (fail-open)');
    return { allowed: true, flaggedCategories: [], reason: null };
  }

  const mime = contentType && /^image\//i.test(contentType) ? contentType : 'image/png';
  const dataUri = `data:${mime};base64,${base64}`;

  try {
    const result = await openai.moderations.create({
      model: MODEL,
      input: [{ type: 'image_url', image_url: { url: dataUri } }],
    });
    const row = result?.results?.[0];
    if (!row) {
      // Unexpected empty response — treat like an infra error.
      throw new Error('moderation returned no result row');
    }

    const flaggedCategories = BLOCK_CATEGORIES.filter(
      (cat) => row.categories && row.categories[cat] === true
    );

    if (flaggedCategories.length > 0) {
      const isMinors = flaggedCategories.includes('sexual/minors');
      return {
        allowed: false,
        flaggedCategories,
        reason: isMinors
          ? 'This image was rejected by our safety check.'
          : 'This image appears to contain nudity or explicit content, which isn\'t allowed. Please upload a different photo.',
      };
    }
    return { allowed: true, flaggedCategories: [], reason: null };
  } catch (err) {
    console.error('[moderation] check failed:', err?.message || err);
    if (failClosed()) {
      return {
        allowed: false,
        flaggedCategories: [],
        reason: 'We couldn\'t verify this image right now. Please try again in a moment.',
      };
    }
    // Fail open — don't block uploads on a transient moderation outage.
    return { allowed: true, flaggedCategories: [], reason: null };
  }
}

module.exports = { moderateImageBase64, isEnabled };
