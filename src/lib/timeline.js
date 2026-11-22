/**
 * timeline.js — pure geometry and drag-editing maths for the waveform timeline.
 * Kept free of React/canvas so it can be unit-tested.
 */

export const MIN_CUE_MS = 100;   // a cue can't be dragged shorter than this
export const EDGE_HIT_PX = 6;    // grab distance for cue edges
export const SNAP_PX = 8;        // snap distance to other edges / playhead
export const MIN_PX_PER_SEC = 0.04; // lets "Fit" show ~9 hours on a 1366px-wide strip
export const MAX_PX_PER_SEC = 1000;

const TICK_STEPS_MS = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];

/** Smallest tick step that keeps labels at least minPx apart. */
export function tickStep(pxPerSec, minPx = 70) {
  for (const s of TICK_STEPS_MS) if ((s / 1000) * pxPerSec >= minPx) return s;
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** Ruler label: "1:05", "1:05.5", "1:05.25", or "1:02:03" past an hour. */
export function tickLabel(ms, step) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const frac = t % 1000;
  let base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  if (step < 1000 && frac) {
    const digits = step % 100 === 0 ? 1 : step % 10 === 0 ? 2 : 3;
    base += `.${String(frac).padStart(3, '0').slice(0, digits)}`;
  }
  return base;
}

export const clampZoom = (pps) => Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pps));

/** Clamp the view start so the view never scrolls past either end. */
export function clampView(viewStartMs, visibleMs, durationMs) {
  return Math.max(0, Math.min(viewStartMs, Math.max(0, durationMs - visibleMs)));
}

/** New view start that keeps `anchorMs` under the same pixel after a zoom. */
export function zoomAround(viewStartMs, oldPps, newPps, anchorMs) {
  const offsetPx = ((anchorMs - viewStartMs) / 1000) * oldPps;
  return anchorMs - (offsetPx / newPps) * 1000;
}

/**
 * Snap `ms` to the nearest target within thresholdMs. Returns { ms, snapped }.
 */
export function snapTime(ms, targets, thresholdMs) {
  let best = ms;
  let bestD = thresholdMs;
  let snapped = false;
  for (const t of targets) {
    const d = Math.abs(t - ms);
    if (d <= bestD) { best = t; bestD = d; snapped = true; }
  }
  return { ms: best, snapped };
}

/** Edges of every cue not in `excludeIds`, plus extras (e.g. the playhead). */
export function snapTargets(cues, excludeIds, extras = []) {
  const out = [...extras];
  cues.forEach(c => { if (!excludeIds.has(c.id)) out.push(c.startMs, c.endMs); });
  return out;
}

/**
 * What's under the pointer at time `ms` (x position in px `x`)?
 * Returns { kind: 'start' | 'end' | 'body', id } or null.
 * Edges win over bodies; among overlapping cues the selected/primary one wins.
 */
export function hitTest(cues, ms, pxPerSec, { priority = null, selected = null } = {}) {
  const tolMs = (EDGE_HIT_PX * 1000) / pxPerSec;
  const rank = (c) => (c.id === priority ? 2 : selected && selected.has(c.id) ? 1 : 0);
  const better = (a, b) => !b || a.rank > b.rank || (a.rank === b.rank && a.d < b.d);
  let edge = null;
  let body = null;
  for (const c of cues) {
    if (c.endMs < ms - tolMs || c.startMs > ms + tolMs) continue;
    // Tiny cues (on screen) can only be grabbed by their edges once selected,
    // otherwise you could never move them.
    const widthPx = ((c.endMs - c.startMs) / 1000) * pxPerSec;
    if (widthPx > EDGE_HIT_PX * 3 || rank(c) > 0) {
      const dS = Math.abs(ms - c.startMs);
      const dE = Math.abs(ms - c.endMs);
      if (dS <= tolMs) { const cand = { kind: 'start', id: c.id, rank: rank(c), d: dS }; if (better(cand, edge)) edge = cand; }
      if (dE <= tolMs) { const cand = { kind: 'end', id: c.id, rank: rank(c), d: dE }; if (better(cand, edge)) edge = cand; }
    }
    if (ms >= c.startMs && ms <= c.endMs) {
      const cand = { kind: 'body', id: c.id, rank: rank(c), d: 0 };
      if (!body || cand.rank > body.rank) body = cand;
    }
  }
  // Inside a selected cue, its own body beats a neighbour's edge.
  if (edge && body && body.rank > edge.rank && body.id !== edge.id) return { kind: 'body', id: body.id };
  if (edge) return { kind: edge.kind, id: edge.id };
  if (body) return { kind: 'body', id: body.id };
  return null;
}

/** Resize one edge of a cue (from the cue as it was when the drag began). */
export function resizeCue(cues, id, edge, ms) {
  return cues.map(c => {
    if (c.id !== id) return c;
    if (edge === 'start') return { ...c, startMs: Math.round(Math.max(0, Math.min(ms, c.endMs - MIN_CUE_MS))) };
    return { ...c, endMs: Math.round(Math.max(ms, c.startMs + MIN_CUE_MS)) };
  });
}

/**
 * Move a group of cues by deltaMs (relative to `original`, the snapshot taken
 * when the drag started). The group stops at 0 rather than squashing.
 */
export function moveCues(original, ids, deltaMs) {
  let minStart = Infinity;
  original.forEach(c => { if (ids.has(c.id) && c.startMs < minStart) minStart = c.startMs; });
  const d = Math.round(Math.max(deltaMs, -minStart));
  return original.map(c => (ids.has(c.id) ? { ...c, startMs: c.startMs + d, endMs: c.endMs + d } : c));
}
