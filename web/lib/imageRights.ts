'use client';

/**
 * Image-rights consent tracking.
 *
 * The user confirms ownership / no-nudity for the images they upload. We
 * tie that consent to the IMAGES, not to a session or a single click:
 * once a given image URL has been confirmed, we don't re-ask for it — but
 * the moment a NEW (unconfirmed) image is added, the next send re-prompts.
 *
 * Confirmed URLs are kept in sessionStorage so consent survives the
 * welcome-composer → studio-form hand-off (same signed URLs flow through)
 * and component remounts, but resets when the tab/session ends.
 */
const KEY = 'blinkugc:confirmedImageUrls';

function readSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {}
}

/** True if every provided URL has already been rights-confirmed. */
export function allImagesConfirmed(urls: string[]): boolean {
  if (urls.length === 0) return true; // nothing to confirm
  const confirmed = readSet();
  return urls.every((u) => confirmed.has(u));
}

/** True if at least one of the provided URLs is NOT yet confirmed. */
export function hasUnconfirmedImages(urls: string[]): boolean {
  return urls.length > 0 && !allImagesConfirmed(urls);
}

/** Mark the given image URLs as rights-confirmed for the rest of the session. */
export function markImagesConfirmed(urls: string[]) {
  if (!urls.length) return;
  const set = readSet();
  for (const u of urls) set.add(u);
  writeSet(set);
}
