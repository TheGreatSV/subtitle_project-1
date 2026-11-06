/**
 * qc.js — subtitle quality check: rules, presets and automatic fixes.
 *
 * checkCues(cues, settings) → issues [{ key, id, index, rule, severity, message, fix }]
 * applyFixes(cues, settings, { rules, ids }) → { cues, fixed }
 *
 * Every function is pure: fixes return a new array so they go through undo.
 */

export const PRESETS = {
  standard: {
    label: 'Standard (streaming / broadcast)',
    maxCps: 20, maxLineLength: 42, maxLines: 2, minDurationMs: 833, maxDurationMs: 7000, minGapMs: 83,
  },
  relaxed: {
    label: 'Relaxed (YouTube / social)',
    maxCps: 25, maxLineLength: 50, maxLines: 3, minDurationMs: 500, maxDurationMs: 10000, minGapMs: 0,
  },
};

export const DEFAULT_SETTINGS = { preset: 'standard', ...PRESETS.standard };

/** Settings fields with UI labels; a value of 0 turns that check off. */
export const SETTING_FIELDS = [
  ['maxCps', 'Max reading speed', 'chars / sec'],
  ['maxLineLength', 'Max line length', 'chars'],
  ['maxLines', 'Max lines per cue', 'lines'],
  ['minDurationMs', 'Min duration', 'ms'],
  ['maxDurationMs', 'Max duration', 'ms'],
  ['minGapMs', 'Min gap between cues', 'ms'],
];

export const RULES = {
  timing: { label: 'End before start', severity: 'error', fix: null },
  overlap: { label: 'Overlap', severity: 'error', fix: 'Trim end' },
  order: { label: 'Out of order', severity: 'error', fix: 'Sort all' },
  empty: { label: 'Empty text', severity: 'error', fix: 'Delete' },
  gap: { label: 'Gap too small', severity: 'warning', fix: 'Trim end' },
  short: { label: 'Too short', severity: 'warning', fix: 'Extend' },
  long: { label: 'Too long', severity: 'warning', fix: null },
  cps: { label: 'Reading speed', severity: 'warning', fix: null },
  lineLength: { label: 'Line too long', severity: 'warning', fix: 'Rebalance' },
  lines: { label: 'Too many lines', severity: 'warning', fix: 'Rebalance' },
  duplicate: { label: 'Repeated text', severity: 'warning', fix: 'Merge' },
  spacing: { label: 'Extra spaces', severity: 'info', fix: 'Clean' },
};

/** Text as the viewer sees it: no <i>/<b>/<font> tags, no {\an8} codes. */
export const visibleText = (t) => String(t ?? '').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');

const sec = (ms) => `${(ms / 1000).toFixed(ms % 1000 ? 3 : 0).replace(/\.?0+$/, '')}s`;

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export function checkCues(cues, s = DEFAULT_SETTINGS) {
  const issues = [];
  const add = (cue, index, rule, message) => issues.push({
    key: `${cue.id}:${rule}`, id: cue.id, index, rule, severity: RULES[rule].severity, message, fix: RULES[rule].fix,
  });

  cues.forEach((c, i) => {
    const vis = visibleText(c.text);
    const lines = vis.split('\n');
    const dur = c.endMs - c.startMs;
    const prev = cues[i - 1];
    const next = cues[i + 1];

    if (!vis.trim()) add(c, i, 'empty', 'No text');
    if (dur <= 0) add(c, i, 'timing', 'Ends at or before it starts');

    if (prev && c.startMs < prev.startMs) add(c, i, 'order', `Starts before cue #${i}`);

    if (next && next.startMs >= c.startMs) {
      const gap = next.startMs - c.endMs;
      if (gap < 0) add(c, i, 'overlap', `Overlaps cue #${i + 2} by ${sec(-gap)}`);
      else if (s.minGapMs > 0 && gap < s.minGapMs) add(c, i, 'gap', `Only ${gap}ms before cue #${i + 2} (min ${s.minGapMs}ms)`);
    }

    if (dur > 0) {
      if (s.minDurationMs > 0 && dur < s.minDurationMs) add(c, i, 'short', `${sec(dur)} on screen (min ${sec(s.minDurationMs)})`);
      if (s.maxDurationMs > 0 && dur > s.maxDurationMs) add(c, i, 'long', `${sec(dur)} on screen (max ${sec(s.maxDurationMs)})`);
      const chars = lines.join('').length;
      const cps = chars / (dur / 1000);
      if (s.maxCps > 0 && chars && cps > s.maxCps) add(c, i, 'cps', `${cps.toFixed(1)} chars/sec (max ${s.maxCps})`);
    }

    if (vis.trim()) {
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      if (s.maxLineLength > 0 && longest > s.maxLineLength) add(c, i, 'lineLength', `Longest line is ${longest} chars (max ${s.maxLineLength})`);
      if (s.maxLines > 0 && lines.length > s.maxLines) add(c, i, 'lines', `${lines.length} lines (max ${s.maxLines})`);
      if (prev && visibleText(prev.text).trim() === vis.trim()) add(c, i, 'duplicate', `Same text as cue #${i}`);
      if (/^[ \t]|[ \t]$|[ \t]{2,}|[ \t]\n|\n[ \t]/m.test(c.text)) add(c, i, 'spacing', 'Leading, trailing or double spaces');
    }
  });

  return issues;
}

export function summarize(issues) {
  const byRule = {};
  let errors = 0;
  let warnings = 0;
  issues.forEach(x => {
    byRule[x.rule] = (byRule[x.rule] || 0) + 1;
    if (x.severity === 'error') errors += 1;
    else if (x.severity === 'warning') warnings += 1;
  });
  return { total: issues.length, errors, warnings, byRule };
}

/** Worst severity per cue id → 'error' | 'warning' | 'info'. */
export function levelsById(issues) {
  const rank = { error: 3, warning: 2, info: 1 };
  const out = new Map();
  issues.forEach(x => {
    const cur = out.get(x.id);
    if (!cur || rank[x.severity] > rank[cur]) out.set(x.id, x.severity);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Line balancing
// ---------------------------------------------------------------------------

/**
 * Re-break text into at most maxLines lines, each ≤ maxLen visible chars,
 * as evenly as possible (minimises the longest line). Keeps a leading {\anN}.
 * Returns null when the words can't fit.
 */
export function rebalance(text, maxLen, maxLines) {
  const pos = (text.match(/^\{\\an[1-9]\}/) || [''])[0];
  const words = text.slice(pos.length).replace(/\s*\n\s*/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const len = words.map(w => visibleText(w).length);
  const n = words.length;
  const span = (a, b) => { let t = b - a - 1; for (let k = a; k < b; k += 1) t += len[k]; return t; }; // chars in words[a..b)

  // best[k][i] = minimal max-line-length splitting words[0..i) into k lines
  const INF = Infinity;
  const best = [Array(n + 1).fill(INF)];
  const cut = [Array(n + 1).fill(-1)];
  best[0][0] = 0;
  for (let k = 1; k <= Math.max(1, maxLines); k += 1) {
    best[k] = Array(n + 1).fill(INF);
    cut[k] = Array(n + 1).fill(-1);
    for (let i = 1; i <= n; i += 1) {
      for (let j = k - 1; j < i; j += 1) {
        if (best[k - 1][j] === INF) continue;
        const w = span(j, i);
        if (w > maxLen && i - j > 1) continue;
        const v = Math.max(best[k - 1][j], w);
        if (v < best[k][i]) { best[k][i] = v; cut[k][i] = j; }
      }
    }
  }
  // Fewest lines whose longest line fits; prefer 1 line, then 2…
  let k = -1;
  for (let t = 1; t <= Math.max(1, maxLines); t += 1) if (best[t][n] <= maxLen) { k = t; break; }
  if (k === -1) return null;
  // With 2+ lines, use the most balanced split for that line count.
  const lines = [];
  let i = n;
  for (let t = k; t >= 1; t -= 1) { const j = cut[t][i]; lines.unshift(words.slice(j, i).join(' ')); i = j; }
  return pos + lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fixes
// ---------------------------------------------------------------------------

const FIX_ORDER = ['order', 'spacing', 'empty', 'duplicate', 'overlap', 'gap', 'short', 'lines'];

const cleanSpaces = (t) => t.split('\n').map(l => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n').trim();

/** One fixer per rule: (list, ctx) → { list, fixed }. ctx = { s, gapMs, inScope }. */
const FIXERS = {
  order(list) {
    const sorted = list.map((c, i) => [c, i]).sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map(([c]) => c);
    const changed = sorted.some((c, i) => c !== list[i]);
    return { list: changed ? sorted : list, fixed: changed ? 1 : 0 };
  },

  spacing(list, { inScope }) {
    let fixed = 0;
    const out = list.map(c => {
      if (!inScope(c)) return c;
      const t = cleanSpaces(c.text);
      if (t === c.text) return c;
      fixed += 1;
      return { ...c, text: t };
    });
    return { list: out, fixed };
  },

  empty(list, { inScope }) {
    const out = list.filter(c => !(inScope(c) && !visibleText(c.text).trim()));
    return { list: out, fixed: list.length - out.length };
  },

  duplicate(list, { inScope }) {
    const out = [];
    let fixed = 0;
    list.forEach(c => {
      const p = out[out.length - 1];
      const vis = visibleText(c.text).trim();
      if (p && vis && inScope(c) && visibleText(p.text).trim() === vis) {
        out[out.length - 1] = { ...p, startMs: Math.min(p.startMs, c.startMs), endMs: Math.max(p.endMs, c.endMs) };
        fixed += 1;
      } else out.push(c);
    });
    return { list: out, fixed };
  },

  overlap: (list, ctx) => trimEnds(list, ctx, (gap) => gap < 0),
  gap: (list, ctx) => trimEnds(list, ctx, (gap) => gap >= 0 && ctx.gapMs > 0 && gap < ctx.gapMs),

  short(list, { s, gapMs, inScope }) {
    if (!(s.minDurationMs > 0)) return { list, fixed: 0 };
    let fixed = 0;
    const out = list.map((c, i) => {
      if (!inScope(c) || c.endMs <= c.startMs || c.endMs - c.startMs >= s.minDurationMs) return c;
      const next = list[i + 1];
      const limit = next && next.startMs >= c.startMs ? next.startMs - gapMs : Infinity;
      const end = Math.min(c.startMs + s.minDurationMs, limit);
      if (end <= c.endMs) return c;
      fixed += 1;
      return { ...c, endMs: end };
    });
    return { list: out, fixed };
  },

  lines(list, { s, inScope }) {
    if (!(s.maxLineLength > 0)) return { list, fixed: 0 };
    let fixed = 0;
    const out = list.map(c => {
      if (!inScope(c)) return c;
      const vis = visibleText(c.text).split('\n');
      const longest = vis.reduce((m, l) => Math.max(m, l.length), 0);
      if (longest <= s.maxLineLength && (!s.maxLines || vis.length <= s.maxLines)) return c;
      const t = rebalance(c.text, s.maxLineLength, s.maxLines || 2);
      if (!t || t === c.text) return c;
      fixed += 1;
      return { ...c, text: t };
    });
    return { list: out, fixed };
  },
};

/** Pull a cue's end back so it stops gapMs before the next cue (when that leaves it any duration). */
function trimEnds(list, { gapMs, inScope }, isBad) {
  let fixed = 0;
  const out = list.map((c, i) => {
    const next = list[i + 1];
    if (!next || !inScope(c) || next.startMs < c.startMs) return c;
    if (!isBad(next.startMs - c.endMs)) return c;
    const end = next.startMs - gapMs;
    if (end <= c.startMs) return c; // can't trim without destroying the cue
    fixed += 1;
    return { ...c, endMs: end };
  });
  return { list: out, fixed };
}

/**
 * Apply automatic fixes.
 *  rules: which rules to fix (default: every fixable rule)
 *  ids:   limit to these cue ids (default: all)
 * Returns { cues, fixed } where fixed counts changed cues.
 */
export function applyFixes(cues, s = DEFAULT_SETTINGS, { rules = null, ids = null } = {}) {
  const want = (r) => (!rules || rules.has(r) || (r === 'lines' && rules.has('lineLength')));
  const ctx = { s, gapMs: Math.max(0, s.minGapMs || 0), inScope: (c) => !ids || ids.has(c.id) };
  let list = cues;
  let fixed = 0;
  FIX_ORDER.filter(want).forEach(rule => {
    const r = FIXERS[rule](list, ctx);
    list = r.list;
    fixed += r.fixed;
  });
  return { cues: fixed ? list : cues, fixed };
}

/** Issues that applyFixes can resolve. */
export const isFixable = (issue) => Boolean(RULES[issue.rule]?.fix);
