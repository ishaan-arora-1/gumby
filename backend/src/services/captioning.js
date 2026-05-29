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

// Bundled font, used so libass renders the same on every host (Azure
// Linux App Service has no "Arial Black" available, and bundling avoids
// any fontconfig surprises). The .ttf ships under backend/assets/fonts.
const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

// ---------------------------------------------------------------------------
// Visual tuning — change these here while iterating on the look.
// ---------------------------------------------------------------------------

const PLAY_RES_X        = 1080;   // ASS coordinate canvas (libass auto-scales
const PLAY_RES_Y        = 1920;   //   to the actual frame size at render time)
const SAFE_WIDTH_RATIO  = 0.85;   // captions never exceed 85% of frame width
const POSITION_Y_RATIO  = 0.76;   // Instagram Reels safe zone — clears bottom UI
const FONT_SIZE         = 72;
const MAX_WORDS_PER_CUE = 3;
const MAX_CHARS_PER_CUE = 18;     // includes spaces
const MAX_GAP_MS        = 250;    // gap larger than this forces a cue break
const POP_IN_MS         = 80;
const POP_SETTLE_MS     = 80;
const LINGER_AFTER_LAST = 300;

const COL_FILL    = '&H00FFFFFF';
const COL_OUTLINE = '&H00000000';
const COL_SHADOW  = '&H80000000';

const DEFAULT_FONT = 'Roboto';

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

function chunkWordsIntoCues(words) {
  const safeWidth = PLAY_RES_X * SAFE_WIDTH_RATIO;
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
      estimateWidth(candidate, FONT_SIZE) > safeWidth ||
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

function buildAss({ cues, font }) {
  const posX = Math.round(PLAY_RES_X / 2);
  const posY = Math.round(PLAY_RES_Y * POSITION_Y_RATIO);

  // BorderStyle 1 = outline + shadow. Alignment 5 = middle-center so
  // \pos() refers to the geometric center of the cue (multi-line grows
  // up/down evenly, never drifts into the Reels bottom UI strip).
  const style = [
    'Style: Caption',
    font,
    FONT_SIZE,
    COL_FILL, COL_FILL, COL_OUTLINE, COL_SHADOW,
    -1, 0, 0, 0,        // Bold, Italic, Underline, StrikeOut
    100, 100, 0, 0,     // ScaleX, ScaleY, Spacing, Angle
    1, 4, 2, 5,         // BorderStyle, Outline px, Shadow px, Alignment
    40, 40, 40, 1,      // MarginL, MarginR, MarginV, Encoding
  ].join(',');

  const events = cues.map((c) => {
    const text = c.words.join(' ');
    // Pop-in: 85% → 106% over POP_IN_MS, settle to 100% over POP_SETTLE_MS.
    const override =
      `{\\an5\\pos(${posX},${posY})` +
      `\\fscx85\\fscy85` +
      `\\t(0,${POP_IN_MS},\\fscx106\\fscy106)` +
      `\\t(${POP_IN_MS},${POP_IN_MS + POP_SETTLE_MS},\\fscx100\\fscy100)}`;
    return `Dialogue: 0,${fmtTime(c.start)},${fmtTime(c.end)},Caption,,0,0,0,,${override}${text}`;
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${PLAY_RES_X}`,
    `PlayResY: ${PLAY_RES_Y}`,
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
 * @param {string} [opts.font]       libass-resolvable font name. Defaults to
 *                                   "Arial Black".
 * @returns {Promise<{ cues: number, wordCount: number }>} debug info.
 */
async function captionVideo({ inputPath, outputPath, scriptHint, font }) {
  if (!inputPath || !outputPath) {
    throw new Error('captionVideo requires inputPath and outputPath');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing — cannot transcribe for captions');
  }

  const workDir = path.dirname(outputPath);
  const audioPath = path.join(workDir, `caption-audio-${process.hrtime.bigint()}.wav`);
  const assPath   = path.join(workDir, `caption-${process.hrtime.bigint()}.ass`);

  try {
    await extractAudio(inputPath, audioPath);
    const words = await transcribeWithWordTimestamps(audioPath, scriptHint);
    if (words.length === 0) {
      throw new Error('Whisper returned 0 words — audio may be silent');
    }
    const cues = chunkWordsIntoCues(words);
    fs.writeFileSync(assPath, buildAss({ cues, font: font || DEFAULT_FONT }), 'utf8');
    await burnSubtitles(inputPath, assPath, outputPath);
    return { cues: cues.length, wordCount: words.length };
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
    try { fs.unlinkSync(assPath); } catch {}
  }
}

module.exports = { captionVideo };
