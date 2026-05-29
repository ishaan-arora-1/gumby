/**
 * Resolves a single ffmpeg binary path the rest of the codebase can spawn.
 *
 * Why: the production deploy is Azure App Service (Linux Node.js), which
 * does NOT include `ffmpeg` on PATH. Spawning the bare name there returns
 * ENOENT, which historically silently disabled the caption burn-in, the
 * faststart remux, and the template frame extraction. The `ffmpeg-static`
 * npm package bundles a statically-linked ffmpeg binary for the host
 * platform and exposes its absolute path — that's what we use whenever
 * it's available, falling back to the system `ffmpeg` for dev machines
 * that already have Homebrew's ffmpeg on PATH.
 */

let resolvedPath = null;

try {
  // Some environments (or future installs) may not have the package at
  // all — `require` would throw. Guard so a missing optional dep never
  // crashes the server.
  // eslint-disable-next-line global-require
  resolvedPath = require('ffmpeg-static');
} catch (err) {
  resolvedPath = null;
}

const ffmpegPath = resolvedPath || 'ffmpeg';

module.exports = { ffmpegPath };
