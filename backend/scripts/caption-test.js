#!/usr/bin/env node
/**
 * Standalone caption test rig.
 *
 *   node scripts/caption-test.js <video-url> [--font "Arial Black"] [--out path.mp4]
 *
 * Downloads the video, extracts audio, runs OpenAI whisper-1 with word-level
 * timestamps, builds an ASS subtitle file with TikTok-style word pops in the
 * Instagram Reels safe zone, and burns the captions into a new MP4 via
 * ffmpeg's libass filter.
 *
 * Intended to let us eyeball the output BEFORE wiring captioning into the
 * production pipeline.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { openai } = require('../src/config/openai');

// ---------------------------------------------------------------------------
// Tuning knobs — change these here while iterating on the look.
// ---------------------------------------------------------------------------

const VIDEO_WIDTH       = 1080;
const VIDEO_HEIGHT      = 1920;
const SAFE_WIDTH_RATIO  = 0.85;   // captions never exceed 85% of frame width
const POSITION_Y_RATIO  = 0.76;   // Instagram Reels safe zone
const FONT_SIZE         = 72;     // primary cue font size (px at 1080-wide)
const FONT_FALLBACK     = 56;     // used only when a single long word overflows
const MAX_WORDS_PER_CUE = 3;
const MAX_CHARS_PER_CUE = 18;     // includes spaces
const MAX_GAP_MS        = 250;    // any gap larger than this forces a cue break
const POP_IN_MS         = 80;     // duration of the scale-up
const POP_SETTLE_MS     = 80;     // overshoot → 100% settle
const LINGER_AFTER_LAST = 300;    // last cue stays this much longer than its word ends

// Caption colors (ASS uses &HAABBGGRR — alpha first, then BGR not RGB)
const COL_FILL    = '&H00FFFFFF'; // white
const COL_OUTLINE = '&H00000000'; // black
const COL_SHADOW  = '&H80000000'; // semi-black

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { font: 'Arial Black', out: null, url: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--font') { args.font = argv[++i]; }
    else if (a === '--out') { args.out = argv[++i]; }
    else if (!a.startsWith('--')) { args.url = a; }
  }
  if (!args.url) {
    console.error('usage: node scripts/caption-test.js <video-url> [--font "Arial Black"] [--out path.mp4]');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing in environment / .env');
    process.exit(1);
  }
  return args;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function downloadTo(filePath, url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed (${resp.status}) for ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return buf.length;
}

async function extractAudio(videoPath, audioPath) {
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vn',                       // no video
    '-ac', '1',                  // mono
    '-ar', '16000',              // 16 kHz (whisper's native rate)
    '-c:a', 'pcm_s16le',         // uncompressed WAV
    audioPath,
  ]);
}

async function transcribeWithWordTimestamps(audioPath, scriptHint) {
  // whisper-1 is the model that exposes word-level timestamps via the API.
  // gpt-4o-transcribe is faster but does not return per-word offsets yet.
  // Passing the known script as `prompt` acts as a soft forced-alignment
  // hint so the timestamps lock onto the right words even on fast speech.
  const file = fs.createReadStream(audioPath);
  const resp = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    prompt: scriptHint || undefined,
    temperature: 0,
  });
  const words = (resp.words || []).map((w) => ({
    word: String(w.word || '').trim(),
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
  })).filter((w) => w.word && w.end > w.start);
  return words;
}

// Estimate pixel width of an all-caps string at the given font size.
// Inter Black / Arial Black average ~0.62× the font size per char (incl space).
// This is a heuristic — close enough to keep us inside the 85% safe band.
function estimateWidth(text, fontSize) {
  return text.length * fontSize * 0.62;
}

function chunkWordsIntoCues(words) {
  const safeWidth = VIDEO_WIDTH * SAFE_WIDTH_RATIO;
  const cues = [];
  let cur = null;

  const flush = () => {
    if (cur && cur.words.length) cues.push(cur);
    cur = null;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const upper = w.word.replace(/[^\p{L}\p{N}'’\-]/gu, '').toUpperCase();
    if (!upper) continue;

    if (!cur) {
      cur = { start: w.start, end: w.end, words: [upper] };
      continue;
    }

    const candidate = cur.words.concat(upper).join(' ');
    const gapMs = (w.start - cur.end) * 1000;
    const wouldExceedChars = candidate.length > MAX_CHARS_PER_CUE;
    const wouldExceedPixels = estimateWidth(candidate, FONT_SIZE) > safeWidth;
    const wouldExceedWords = cur.words.length >= MAX_WORDS_PER_CUE;

    if (gapMs > MAX_GAP_MS || wouldExceedChars || wouldExceedPixels || wouldExceedWords) {
      flush();
      cur = { start: w.start, end: w.end, words: [upper] };
    } else {
      cur.words.push(upper);
      cur.end = w.end;
    }
  }
  flush();

  // Close gaps so cues snap one-to-the-next with no flicker between them.
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
  const s = (sec % 60);
  const ss = Math.floor(s);
  const cs = Math.round((s - ss) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

function buildAss({ cues, font }) {
  const posX = Math.round(VIDEO_WIDTH / 2);
  const posY = Math.round(VIDEO_HEIGHT * POSITION_Y_RATIO);

  // Style fields:
  // Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour,
  // BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing,
  // Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR,
  // MarginV, Encoding
  //
  // Alignment 5 = middle-center (so \pos() is the geometric center of the
  // text block — multi-line cues grow up/down evenly, never drift into the
  // Reels bottom UI strip).
  const style = [
    'Style: Caption',
    font,
    FONT_SIZE,
    COL_FILL,
    COL_FILL,
    COL_OUTLINE,
    COL_SHADOW,
    -1,            // Bold
    0,             // Italic
    0,             // Underline
    0,             // StrikeOut
    100,           // ScaleX
    100,           // ScaleY
    0,             // Spacing
    0,             // Angle
    1,             // BorderStyle (1 = outline + shadow)
    4,             // Outline px
    2,             // Shadow px
    5,             // Alignment (5 = middle-center)
    40,            // MarginL
    40,            // MarginR
    40,            // MarginV
    1,             // Encoding
  ].join(',');

  const events = cues.map((c) => {
    const text = c.words.join(' ');
    // Pop-in: scale 85 → 106 over POP_IN_MS, then 106 → 100 over POP_SETTLE_MS.
    // \an5 keeps the anchor as the text's center so the scale grows from the
    // middle outward (looks like a UI pop, not a stretch).
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
    `PlayResX: ${VIDEO_WIDTH}`,
    `PlayResY: ${VIDEO_HEIGHT}`,
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
  // libass takes a file path. On Windows/Win paths we'd need to escape
  // colons; on macOS / linux this form is fine. We re-encode video (must,
  // since we're burning pixels) and stream-copy audio.
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-vf', `ass=${assPath}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outPath,
  ]);
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-test-'));
  const inputPath  = path.join(workDir, 'input.mp4');
  const audioPath  = path.join(workDir, 'audio.wav');
  const assPath    = path.join(workDir, 'caps.ass');
  const outPath    = path.resolve(args.out || path.join(process.cwd(), 'captioned.mp4'));

  try {
    console.log(`▸ downloading video → ${inputPath}`);
    const bytes = await downloadTo(inputPath, args.url);
    console.log(`  ${(bytes / 1024 / 1024).toFixed(2)} MB`);

    console.log('▸ extracting audio');
    await extractAudio(inputPath, audioPath);

    console.log('▸ transcribing (whisper-1, word timestamps)');
    const t0 = Date.now();
    const words = await transcribeWithWordTimestamps(audioPath, null);
    console.log(`  ${words.length} words in ${(Date.now() - t0)/1000}s`);
    if (words.length === 0) {
      throw new Error('no words returned — is the video silent?');
    }

    console.log('▸ chunking into cues');
    const cues = chunkWordsIntoCues(words);
    console.log(`  ${cues.length} cues:`);
    for (const c of cues) {
      const text = c.words.join(' ');
      console.log(`   ${fmtTime(c.start)} → ${fmtTime(c.end)}  "${text}"`);
    }

    console.log('▸ writing ASS subtitle file');
    const ass = buildAss({ cues, font: args.font });
    fs.writeFileSync(assPath, ass, 'utf8');

    console.log(`▸ burning captions (font="${args.font}")`);
    await burnSubtitles(inputPath, assPath, outPath);

    console.log(`\n✓ done → ${outPath}`);
    console.log(`  open: open "${outPath}"`);
  } catch (err) {
    console.error('\n✗ failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    // Keep workDir on failure for inspection; clean on success.
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

main();
