/**
 * time.js — single source of truth for subtitle timecodes.
 *
 * Internally every cue stores times as integer milliseconds.
 * Strings ("HH:MM:SS,mmm") exist only at the edges: inputs, display, file I/O.
 */

const TIME_RE = /^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;

/** "00:01:02,345" (or with ".") → 62345. Returns NaN for anything invalid. */
export function parseTime(str) {
  if (typeof str !== 'string') return NaN;
  const m = str.trim().match(TIME_RE);
  if (!m) return NaN;
  const [, h, min, s, msRaw] = m;
  if (+min > 59 || +s > 59) return NaN;
  const ms = +msRaw.padEnd(3, '0'); // ",5" means 500ms, not 5ms
  return (+h) * 3600000 + (+min) * 60000 + (+s) * 1000 + ms;
}

/** 62345 → "00:01:02,345". Negative values clamp to zero. */
export function formatTime(ms, sep = ',') {
  ms = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
}

/** WebVTT uses "." as the millisecond separator. */
export const formatVttTime = (ms) => formatTime(ms, '.');

/** Seconds (e.g. from a video element) → ms. */
export const secondsToMs = (sec) => Math.max(0, Math.round((Number(sec) || 0) * 1000));

/** Ms → seconds, for seeking a video element. */
export const msToSeconds = (ms) => (Number(ms) || 0) / 1000;

/** True when a string is a complete, valid "HH:MM:SS,mmm" timecode. */
export const isCompleteTime = (str) => typeof str === 'string' && str.length === 12 && !Number.isNaN(parseTime(str));

/**
 * Input mask for time fields: keeps digits only and inserts separators
 * as the user types — "0001023" → "00:01:02,3".
 */
export function maskTimeInput(val) {
  const d = String(val).replace(/\D/g, '').slice(0, 9);
  let out = d.slice(0, 2);
  if (d.length > 2) out += ':' + d.slice(2, 4);
  if (d.length > 4) out += ':' + d.slice(4, 6);
  if (d.length > 6) out += ',' + d.slice(6, 9);
  return out;
}
