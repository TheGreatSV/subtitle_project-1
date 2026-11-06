/**
 * edit.js — pure cue-editing operations. Every function takes a cue array
 * and returns a new one (never mutates), so each result can go straight
 * into the undo history.
 */
import { makeCue } from './cues';

const clamp0 = (n) => Math.max(0, Math.round(n));

/** Insert keeping the list ordered by start time (stable for equal starts). */
export function insertByStart(cues, cue) {
  const at = cues.findIndex(c => c.startMs > cue.startMs);
  if (at === -1) return [...cues, cue];
  return [...cues.slice(0, at), cue, ...cues.slice(at)];
}

/** Index range [lo, hi] covered by ids, and whether every cue in it is selected. */
export function selectionRange(cues, ids) {
  const idx = [];
  cues.forEach((c, i) => { if (ids.has(c.id)) idx.push(i); });
  if (idx.length === 0) return null;
  const lo = idx[0];
  const hi = idx[idx.length - 1];
  return { lo, hi, contiguous: hi - lo + 1 === idx.length, count: idx.length };
}

/**
 * Merge the cues at indices lo..hi into one. Text is joined with a space,
 * or a newline when any part already spans several lines.
 * Returns { cues, mergedId } or null.
 */
export function mergeRange(cues, lo, hi) {
  if (lo < 0 || hi >= cues.length || hi <= lo) return null;
  const parts = cues.slice(lo, hi + 1);
  const multi = parts.some(c => c.text.includes('\n'));
  const merged = {
    ...parts[0],
    startMs: Math.min(...parts.map(c => c.startMs)),
    endMs: Math.max(...parts.map(c => c.endMs)),
    text: parts.map(c => c.text.trim()).filter(Boolean).join(multi ? '\n' : ' '),
  };
  return { cues: [...cues.slice(0, lo), merged, ...cues.slice(hi + 1)], mergedId: merged.id };
}

/**
 * Split one cue in two.
 *  - textIndex: where to cut the text (e.g. the caret). Defaults to the middle word boundary.
 *  - atMs: where to cut the time. Used only if strictly inside the cue; otherwise the
 *    cut is placed proportionally to how much text falls on each side.
 * Returns [first, second] or null if the cue is too short to split.
 */
export function splitCue(cue, { atMs, textIndex } = {}) {
  const dur = cue.endMs - cue.startMs;
  if (dur < 2) return null;

  const text = cue.text;
  let cut = textIndex;
  if (cut == null || cut <= 0 || cut >= text.length) {
    const words = text.split(' ');
    const mid = Math.max(1, Math.round(words.length / 2));
    cut = words.slice(0, mid).join(' ').length;
  }
  const a = text.slice(0, cut).trim();
  const b = text.slice(cut).trim();

  let t;
  if (Number.isFinite(atMs) && atMs > cue.startMs && atMs < cue.endMs) {
    t = atMs;
  } else {
    const ratio = text.length ? Math.min(0.9, Math.max(0.1, cut / text.length)) : 0.5;
    t = cue.startMs + dur * ratio;
  }
  t = Math.round(t);

  return [
    { ...cue, endMs: t, text: a },
    makeCue({ startMs: t, endMs: cue.endMs, text: b }),
  ];
}

/** Move cues by deltaMs. edge: 'both' | 'start' | 'end'. Clamps at 0 and keeps end ≥ start. */
export function nudgeCues(cues, ids, deltaMs, edge = 'both') {
  return cues.map(c => {
    if (!ids.has(c.id)) return c;
    let startMs = edge === 'end' ? c.startMs : c.startMs + deltaMs;
    let endMs = edge === 'start' ? c.endMs : c.endMs + deltaMs;
    if (edge === 'both' && startMs < 0) { endMs -= startMs; startMs = 0; } // keep duration at the zero edge
    startMs = clamp0(startMs);
    endMs = clamp0(endMs);
    if (endMs < startMs) {
      if (edge === 'start') startMs = endMs; else endMs = startMs;
    }
    return { ...c, startMs, endMs };
  });
}

/**
 * Set one edge of a cue to a time (e.g. the playhead).
 * Setting start past the end keeps the cue's duration; setting end before start is refused.
 * Returns the new array, or null if refused.
 */
export function setCueEdge(cues, id, edge, ms) {
  ms = clamp0(ms);
  let refused = false;
  const next = cues.map(c => {
    if (c.id !== id) return c;
    if (edge === 'start') {
      if (ms >= c.endMs) return { ...c, startMs: ms, endMs: ms + Math.max(500, c.endMs - c.startMs) };
      return { ...c, startMs: ms };
    }
    if (ms <= c.startMs) { refused = true; return c; }
    return { ...c, endMs: ms };
  });
  return refused ? null : next;
}

/**
 * A new empty cue at `atMs`. It runs for defaultMs, or stops at the next cue's
 * start if that is sooner (but never shorter than 500ms).
 */
export function newCueAt(cues, atMs, defaultMs = 2000) {
  const start = clamp0(atMs);
  const next = cues.filter(c => c.startMs > start).reduce((m, c) => Math.min(m, c.startMs), Infinity);
  let end = start + defaultMs;
  if (next - start >= 500 && next < end) end = next;
  return makeCue({ startMs: start, endMs: end, text: '' });
}

// ---------------------------------------------------------------------------
// Find & replace
// ---------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build a global RegExp from find options. Throws on an invalid regex. Returns null for an empty query. */
export function buildMatcher(query, { caseSensitive = false, regex = false, wholeWord = false } = {}) {
  if (!query) return null;
  let src = regex ? query : escapeRe(query);
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  // The "u" flag is needed for \p{L} (letters in any script, e.g. Malayalam) but is stricter
  // about escapes, so only add it when whole-word matching asks for it.
  return new RegExp(src, `g${caseSensitive ? '' : 'i'}${wholeWord ? 'u' : ''}`);
}

const countIn = (text, re) => {
  re.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    n += 1;
    if (m[0] === '') re.lastIndex += 1; // avoid infinite loop on empty matches
  }
  return n;
};

/** [{ id, index, count }] for every cue whose text matches. */
export function findMatches(cues, re) {
  if (!re) return [];
  const out = [];
  cues.forEach((c, index) => {
    const count = countIn(c.text, re);
    if (count) out.push({ id: c.id, index, count });
  });
  return out;
}

/** Replacement text: literal unless regex mode, where $1 etc. work. */
export const replacementFor = (replacement, regex) => (regex ? replacement : replacement.replace(/\$/g, '$$$$'));

/** Replace in the cues listed in `ids` (or all when ids is null). Returns { cues, count }. */
export function replaceInCues(cues, re, replacement, { regex = false, ids = null } = {}) {
  if (!re) return { cues, count: 0 };
  const rep = replacementFor(replacement, regex);
  let count = 0;
  const next = cues.map(c => {
    if (ids && !ids.has(c.id)) return c;
    const n = countIn(c.text, re);
    if (!n) return c;
    count += n;
    re.lastIndex = 0;
    return { ...c, text: c.text.replace(re, rep) };
  });
  return { cues: count ? next : cues, count };
}
