/**
 * typing.js — timing rules for Typing mode.
 *
 * In Typing mode the user listens and types. A cue starts where the previous
 * typed cue ended (or where the user sets "start here") and ends at the moment
 * they began typing it — that's when the phrase they're typing has been heard.
 */
import { visibleText } from './qc';

export const MIN_TYPED_MS = 300;

/** Reading-speed duration for text: 15 chars/s, between 1 and 7 seconds. */
export function readingMs(text) {
  const chars = visibleText(text).replace(/\s*\n\s*/g, ' ').length;
  return Math.min(7000, Math.max(1000, Math.round((chars / 15) * 1000)));
}

/**
 * Times for a typed cue. If the captured end is missing or too close to (or
 * before) the start — e.g. the video was paused, or the user rewound — fall back
 * to a reading-speed duration so the cue is always usable.
 */
export function typedCueRange(startMs, endMs, text) {
  const start = Math.max(0, Math.round(startMs || 0));
  if (Number.isFinite(endMs) && endMs - start >= MIN_TYPED_MS) return { startMs: start, endMs: Math.round(endMs) };
  return { startMs: start, endMs: start + readingMs(text) };
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Next speed up/down the list (dir = +1 / -1), staying within it. */
export function stepSpeed(rate, dir) {
  const i = SPEEDS.findIndex(s => s >= rate - 1e-9);
  const cur = i === -1 ? SPEEDS.length - 1 : i;
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, cur + dir))];
}

/** Time range to loop: the selection's span, or the primary cue. */
export function loopRangeFor(cues, selIds, primaryId) {
  const picked = cues.filter(c => (selIds && selIds.size > 1 ? selIds.has(c.id) : c.id === primaryId));
  if (!picked.length) return null;
  const startMs = Math.min(...picked.map(c => c.startMs));
  const endMs = Math.max(...picked.map(c => c.endMs));
  return endMs > startMs ? { startMs, endMs } : null;
}
