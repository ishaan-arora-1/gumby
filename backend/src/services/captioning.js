/**
 * Caption an MP4 with TikTok-style word pops in the Instagram Reels safe
 * zone. Two API calls (Whisper transcription + ffmpeg burn-in via libass),
 * uses the OpenAI SDK + ffmpeg that the rest of the pipeline already
 * depends on. No external rendering vendor.
 *
 *   await captionVideo({
 *     inputPath: '/tmp/.../kling.mp4',
 *     outputPath: '/tmp/.../captioned.mp4',
 *     scriptHint: 'optional — the original ad script, used to anchor the
 *                  Whisper word timestamps against the words we expect',
 *   })
 *
 * Throws on failure. Caller is expected to wrap in try/catch and fall back
 * to the uncaptioned MP4 if captioning fails — we never want a caption
 * error to nuke an otherwise-good video.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { openai } = require('../config/openai');
const { ffmpegPath } = require('../config/ffmpeg');
const { getPreset, DEFAULT_PRESET_ID } = require('./captionPresets');

// Bundled fonts — libass loads from here via fontsdir so the same glyphs
// render on every host regardless of fontconfig state.
const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

// ---------------------------------------------------------------------------
// Cue-chunking knobs — these are NOT per-preset (they govern timing/breaks,
// not visual style). Pixel width estimation uses the preset's fontSize.
// ---------------------------------------------------------------------------

const PLAY_RES_X        = 1080;   // default ASS canvas (9:16). The real canvas
const PLAY_RES_Y        = 1920;   //   is chosen per aspect ratio — see below.
const SAFE_WIDTH_RATIO  = 0.85;   // captions never exceed 85% of frame width

// The ASS PlayRes canvas MUST match the aspect ratio of the actual frame.
// libass scales the canvas to the rendered frame: if the canvas is 9:16 but
// the video is 16:9, captions get horizontally stretched AND the vertical
// `positionYRatio` lands in the wrong place. Matching the canvas to the frame
// keeps text un-distorted and positioned correctly for every aspect.
function resolutionForAspect(aspectRatio) {
  switch (aspectRatio) {
    case '16:9': return { x: 1920, y: 1080 };
    case '1:1':  return { x: 1080, y: 1080 };
    case '9:16':
    default:     return { x: 1080, y: 1920 };
  }
}
const MAX_WORDS_PER_CUE = 3;
const MAX_CHARS_PER_CUE = 18;     // includes spaces
const MAX_GAP_MS        = 250;    // gap larger than this forces a cue break
const LINGER_AFTER_LAST = 300;

// Convert "#RRGGBB" + optional alpha (0..1) into ASS "&HAABBGGRR" — note
// ASS alpha is INVERTED (00 = opaque, FF = transparent).
function hexToAss(hex, alpha = 1) {
  const cleaned = (hex || '#000000').replace('#', '');
  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  const a = Math.round((1 - Math.max(0, Math.min(1, alpha))) * 255)
    .toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`;
}

// ---------------------------------------------------------------------------

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      // ENOENT here means the binary isn't where we thought — surface it
      // loudly because the previous behavior (silent caption skip) hid
      // exactly the kind of failure we need to know about.
      reject(new Error(`ffmpeg spawn failed (${ffmpegPath}): ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function extractAudio(videoPath, audioPath) {
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
    audioPath,
  ]);
}

async function transcribeWithWordTimestamps(audioPath, scriptHint) {
  // whisper-1 is the model that exposes per-word timestamps. The
  // script-as-prompt acts as a soft forced-alignment hint so timings
  // lock onto the right words even when speech is fast.
  const file = fs.createReadStream(audioPath);
  const resp = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    prompt: scriptHint ? String(scriptHint).slice(0, 800) : undefined,
    temperature: 0,
  });
  return (resp.words || [])
    .map((w) => ({
      word: String(w.word || '').trim(),
      start: Number(w.start) || 0,
      end: Number(w.end) || 0,
    }))
    .filter((w) => w.word && w.end > w.start);
}

// Heuristic pixel width for Inter Black / Arial Black — ~0.62× font size
// per character including spaces. We have a 15% safety margin from
// SAFE_WIDTH_RATIO so a heuristic is enough; we don't need canvas metrics.
function estimateWidth(text, fontSize) {
  return text.length * fontSize * 0.62;
}

function chunkWordsIntoCues(words, fontSize, playResX = PLAY_RES_X) {
  const safeWidth = playResX * SAFE_WIDTH_RATIO;
  const cues = [];
  let cur = null;

  const flush = () => {
    if (cur && cur.words.length) cues.push(cur);
    cur = null;
  };

  for (const w of words) {
    const upper = w.word.replace(/[^\p{L}\p{N}'’\-]/gu, '').toUpperCase();
    if (!upper) continue;

    if (!cur) {
      cur = { start: w.start, end: w.end, words: [upper] };
      continue;
    }

    const candidate = cur.words.concat(upper).join(' ');
    const gapMs = (w.start - cur.end) * 1000;

    if (
      gapMs > MAX_GAP_MS ||
      candidate.length > MAX_CHARS_PER_CUE ||
      estimateWidth(candidate, fontSize) > safeWidth ||
      cur.words.length >= MAX_WORDS_PER_CUE
    ) {
      flush();
      cur = { start: w.start, end: w.end, words: [upper] };
    } else {
      cur.words.push(upper);
      cur.end = w.end;
    }
  }
  flush();

  // Snap cues end-to-end so there's no flicker between phrases.
  for (let i = 0; i < cues.length - 1; i++) {
    cues[i].end = cues[i + 1].start;
  }
  if (cues.length) {
    cues[cues.length - 1].end += LINGER_AFTER_LAST / 1000;
  }
  return cues;
}

function fmtTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = Math.floor(s);
  const cs = Math.round((s - ss) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function buildAss({ cues, preset, playResX = PLAY_RES_X, playResY = PLAY_RES_Y }) {
  const posX = Math.round(playResX / 2);
  const posY = Math.round(playResY * preset.positionYRatio);

  // BorderStyle 1 = outline + drop shadow (current default look).
  // BorderStyle 3 = opaque rectangle behind the text (block look). The
  // box color comes from OutlineColour; Outline px controls horizontal
  // padding inside the box.
  const useBoxBackground = !!preset.boxBgHex;

  const fill = hexToAss(preset.fillHex, 1);
  // Outline color doubles as the box color in block mode. Same hex,
  // different role.
  const outline = useBoxBackground
    ? hexToAss(preset.boxBgHex, preset.boxBgAlpha ?? 1)
    : hexToAss(preset.outlineHex, 1);
  const back = useBoxBackground
    ? hexToAss(preset.boxBgHex, preset.boxBgAlpha ?? 1)
    : hexToAss(preset.shadowHex, preset.shadowAlpha);

  // In block mode the "outline px" becomes box padding; in outline
  // mode it's the stroke width.
  const borderStyle = useBoxBackground ? 3 : 1;
  const outlineOrPaddingPx = useBoxBackground
    ? (preset.boxPaddingPx ?? 8)
    : preset.outlineWidthPx;
  // No drop shadow in block mode — looks muddy stacked on a colored box.
  const shadowPx = useBoxBackground ? 0 : preset.shadowDyPx;

  // Italic is optional and orthogonal to outline/block style.
  const italicFlag = preset.italic ? -1 : 0;

  const style = [
    'Style: Caption',
    preset.font,
    preset.fontSize,
    fill, fill, outline, back,
    -1, italicFlag, 0, 0,                          // Bold, Italic, Underline, StrikeOut
    100, 100, 0, 0,                                // ScaleX, ScaleY, Spacing, Angle
    borderStyle, outlineOrPaddingPx, shadowPx, 5,  // BorderStyle, Outline px, Shadow px, Alignment
    40, 40, 40, 1,                                 // MarginL, MarginR, MarginV, Encoding
  ].join(',');

  const events = cues.map((c) => {
    const text = c.words.join(' ');
    const from = preset.popFromPct;
    const peak = preset.popPeakPct;
    const settle = preset.popSettlePct;
    const inMs = preset.popInMs;
    const settleMs = preset.popSettleMs;
    const override =
      `{\\an5\\pos(${posX},${posY})` +
      `\\fscx${from}\\fscy${from}` +
      `\\t(0,${inMs},\\fscx${peak}\\fscy${peak})` +
      `\\t(${inMs},${inMs + settleMs},\\fscx${settle}\\fscy${settle})}`;
    return `Dialogue: 0,${fmtTime(c.start)},${fmtTime(c.end)},Caption,,0,0,0,,${override}${text}`;
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'ScaledBorderAndShadow: yes',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}

async function burnSubtitles(videoPath, assPath, outPath) {
  // `fontsdir=` tells libass to look at the bundled fonts directory FIRST,
  // before whatever fontconfig finds on the host. Without it, Linux App
  // Service falls back to DejaVu Sans and the caption look is wrong.
  // The path needs ffmpeg-style escaping (colons and backslashes); on
  // mac/linux the simple form below is safe.
  const assFilter = `ass=${assPath}:fontsdir=${FONTS_DIR}`;
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vf', assFilter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outPath,
  ]);
}

// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} opts.inputPath    Local path to the source MP4.
 * @param {string} opts.outputPath   Local path to write the captioned MP4 to.
 * @param {string} [opts.scriptHint] Optional script text to anchor the
 *                                   Whisper word timestamps.
 * @param {string} [opts.presetId]   Caption style preset id. Defaults to
 *                                   DEFAULT_PRESET_ID. Unknown ids fall
 *                                   back to the default — never throws.
 * @param {string} [opts.aspectRatio] '9:16' | '16:9' | '1:1'. Sizes the ASS
 *                                   canvas so captions aren't stretched or
 *                                   mis-positioned on non-portrait videos.
 * @returns {Promise<{ cues: number, wordCount: number, presetId: string }>}
 */
async function captionVideo({ inputPath, outputPath, scriptHint, presetId, aspectRatio }) {
  if (!inputPath || !outputPath) {
    throw new Error('captionVideo requires inputPath and outputPath');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — cannot transcribe for captions');
  }

  const preset = getPreset(presetId);
  const workDir = path.dirname(outputPath);
  const audioPath = path.join(workDir, `caption-audio-${process.hrtime.bigint()}.wav`);
  const assPath   = path.join(workDir, `caption-${process.hrtime.bigint()}.ass`);

  try {
    await extractAudio(inputPath, audioPath);
    const words = await transcribeWithWordTimestamps(audioPath, scriptHint);
    if (words.length === 0) {
      throw new Error('Whisper returned 0 words — audio may be silent');
    }
    const res = resolutionForAspect(aspectRatio);
    const cues = chunkWordsIntoCues(words, preset.fontSize, res.x);
    fs.writeFileSync(assPath, buildAss({ cues, preset, playResX: res.x, playResY: res.y }), 'utf8');
    await burnSubtitles(inputPath, assPath, outputPath);
    return { cues: cues.length, wordCount: words.length, presetId: preset.id };
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.unlinkSync(assPath); } catch {}
  }
}

module.exports = { captionVideo };
