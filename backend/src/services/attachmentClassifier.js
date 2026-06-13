/**
 * Per-image role classification.
 *
 * Given the user's prompt + their uploaded reference images, decide what
 * each image is: creator / product / background / style. This is what lets
 * the pipeline know what to do with each picture WITHOUT the user having to
 * tag anything in the UI — a lone "creator" image (e.g. a model already
 * wearing the product) is used as-is straight into Kling, while everything
 * else composites via Nano Banana.
 *
 * Reads BOTH the image and the prompt (GPT-4o-mini vision), so "this is the
 * model, make them walk" correctly tags the photo as the creator.
 *
 * Non-fatal: on any failure we return a best-effort fallback (single image
 * -> creator, multiple -> product) so generation never blocks on this.
 */
const { openai } = require('../config/openai');

const VALID_ROLES = new Set(['creator', 'product', 'background', 'style']);

/**
 * @param {string} prompt   The user's free-form video description.
 * @param {string[]} urls   Reference image URLs (HTTP/HTTPS), in order.
 * @returns {Promise<string[]>} One role per URL, same order.
 */
async function classifyRoles(prompt, urls) {
  const clean = (Array.isArray(urls) ? urls : [])
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    .slice(0, 10);
  if (!clean.length) return [];

  const cleanPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 2000) : '';
  // Failed-call fallback: a single image is most often the creator the user
  // wants on camera; multiples default to product (composite via Nano Banana).
  const fallback = clean.map(() => (clean.length === 1 ? 'creator' : 'product'));

  try {
    const sys = [
      'You classify reference images for a UGC product-ad video generator.',
      'For EACH image, assign exactly ONE role, using BOTH what the image shows AND the user\'s request:',
      '- "creator": a person/model who should appear on camera in the final video. This INCLUDES a person already wearing or holding the product the user is selling — if the user wants that exact person and that exact product kept as shown, the role is "creator" (the whole image is used as-is, so both the model and the product are preserved).',
      '- "product": a product/item on its OWN (no person), OR a product that should be moved onto a DIFFERENT creator than the one shown.',
      '- "background": a location/setting to use as the environment.',
      '- "style": a vibe/style reference only, not used literally.',
      'Key guidance:',
      '- If the image shows a person AND that person is wearing/holding the product, default to "creator" — UNLESS the user explicitly asks for a new/different model or to move the product onto someone else (then "product").',
      '- "this is the model" / "make this person do X" / "keep this look" => "creator".',
      '- A bare product shot with no person => "product".',
      'Return ONLY JSON: {"roles":["creator","product",...]} with one entry per image, IN THE SAME ORDER as given.',
    ].join('\n');

    const userContent = [
      { type: 'text', text: `User request: "${cleanPrompt || '(none yet)'}"\n\nClassify these ${clean.length} image(s), in order.` },
      ...clean.map((u) => ({ type: 'image_url', image_url: { url: u } })),
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed = [];
    try { parsed = JSON.parse(raw).roles || []; } catch {}
    return clean.map((_, i) => (VALID_ROLES.has(parsed[i]) ? parsed[i] : fallback[i]));
  } catch (err) {
    console.error('[classifier] failed, using fallback roles:', err?.message || err);
    return fallback;
  }
}

module.exports = { classifyRoles, VALID_ROLES };
