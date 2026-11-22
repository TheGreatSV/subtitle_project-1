/**
 * tools.js — batch sync and text tools. Every function is pure:
 * (cues, options, ids?) → new cues array (unchanged cues keep their identity),
 * so results go straight into undo history and previews can diff by identity.
 *
 * `ids` limits a tool to those cue ids; null/undefined means every cue.
 */
import { rebalance, visibleText } from './qc';

const inScope = (ids) => (c) => !ids || ids.has(c.id);
const round = Math.round;

/** Apply fn to in-scope cues; keep the original object when nothing changed. */
function mapCues(cues, ids, fn) {
  const ok = inScope(ids);
  let changed = false;
  const out = cues.map(c => {
    if (!ok(c)) return c;
    const n = fn(c);
    if (!n || (n.startMs === c.startMs && n.endMs === c.endMs && n.text === c.text)) return c;
    changed = true;
    return n;
  });
  return changed ? out : cues;
}

/** Cues that a tool result changed or removed, for previews. */
export function diffCues(before, after) {
  const byId = new Map(after.map(c => [c.id, c]));
  const changes = [];
  before.forEach((c, index) => {
    const n = byId.get(c.id);
    if (!n) changes.push({ index, before: c, after: null });
    else if (n !== c) changes.push({ index, before: c, after: n });
  });
  return changes;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const FPS_PRESETS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

/**
 * Subtitles timed for a video at `fromFps`, to play with a version at `toFps`
 * (e.g. a 25 fps PAL file vs a 23.976 fps release). Times scale by fromFps / toFps.
 */
export function convertFrameRate(cues, fromFps, toFps, ids) {
  if (!(fromFps > 0) || !(toFps > 0) || fromFps === toFps) return cues;
  const k = fromFps / toFps;
  return mapCues(cues, ids, c => ({ ...c, startMs: round(c.startMs * k), endMs: round(c.endMs * k) }));
}

/**
 * Two-point sync: given two cues' current start times (a.fromMs, b.fromMs) and
 * where they should be (a.toMs, b.toMs), stretch and shift everything linearly.
 * Fixes subtitles that start in sync and drift out (or vice versa).
 * Returns { cues, scale, offsetMs } or null when the points can't define a mapping.
 */
export function twoPointSync(cues, a, b, ids) {
  if (![a.fromMs, a.toMs, b.fromMs, b.toMs].every(Number.isFinite)) return null;
  if (a.fromMs === b.fromMs) return null;
  const scale = (b.toMs - a.toMs) / (b.fromMs - a.fromMs);
  if (!(scale > 0)) return null;
  const map = (t) => Math.max(0, round(a.toMs + (t - a.fromMs) * scale));
  const out = mapCues(cues, ids, c => ({ ...c, startMs: map(c.startMs), endMs: Math.max(map(c.startMs), map(c.endMs)) }));
  return { cues: out, scale, offsetMs: round(a.toMs - a.fromMs * scale) };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const POS_RE = /^\{\\an[1-9]\}/;
const splitPos = (text) => { const m = text.match(POS_RE); return m ? [m[0], text.slice(m[0].length)] : ['', text]; };

/** Remove tags left with nothing inside ("<i></i>") and trim each line. */
function tidy(text) {
  let t = text;
  for (let i = 0; i < 3; i += 1) t = t.replace(/<([ibu])>\s*<\/\1>/gi, '');
  return t.split('\n').map(l => l.replace(/[ \t]{2,}/g, ' ').trim()).filter(Boolean).join('\n');
}

export const HI_OPTIONS = {
  brackets: { label: 'Text in [square brackets]', example: '[door slams]' },
  parens: { label: 'Text in (round brackets)', example: '(laughs)' },
  speakers: { label: 'Speaker names in capitals', example: 'JOHN: Hi → Hi' },
  music: { label: 'Music notes and sung lines', example: '♪ la la ♪' },
};

/**
 * Remove hearing-impaired (SDH) annotations. Cues left empty are deleted.
 * opts: { brackets, parens, speakers, music } (booleans)
 */
export function removeHearingImpaired(cues, opts, ids) {
  const ok = inScope(ids);
  let changed = false;
  const out = [];
  cues.forEach(c => {
    if (!ok(c)) { out.push(c); return; }
    const [pos, body] = splitPos(c.text);
    let t = body;
    if (opts.brackets) t = t.replace(/\[[^\]\n]*\]/g, '');
    if (opts.parens) t = t.replace(/\([^)\n]*\)/g, '');
    if (opts.music) {
      // Sung lines start with a note; drop them, then any stray notes.
      t = t.split('\n').filter(l => !/^\s*(<[^>]+>\s*)*[♪♫#]/.test(l)).join('\n');
      t = t.replace(/[♪♫]+/g, '');
    }
    if (opts.speakers) t = t.replace(/(^|\n)(\s*(?:<[ibu]>)?\s*)(?:-\s*)?[A-Z][A-Z0-9 .'’-]{1,30}:\s*/g, '$1$2');
    // A leading dash left alone on a line ("- " after removing "(laughs)") goes too.
    t = t.split('\n').map(l => l.replace(/^\s*-\s*$/, '')).join('\n');
    if (t === body) { out.push(c); return; } // nothing to remove in this cue
    t = tidy(t);
    changed = true;
    if (!visibleText(t).trim()) return; // nothing left → drop the cue
    out.push({ ...c, text: pos + t });
  });
  return changed ? out : cues;
}

/** Change case: 'upper' | 'lower' | 'sentence'. Tags and {\anN} are kept as they are. */
export function changeCase(cues, mode, ids) {
  const apply = (s) => {
    if (mode === 'upper') return s.toLocaleUpperCase();
    if (mode === 'lower') return s.toLocaleLowerCase();
    return s;
  };
  return mapCues(cues, ids, c => {
    const parts = c.text.split(/(<[^>]+>|\{\\[^}]*\})/);
    let text;
    if (mode === 'sentence') {
      let capNext = true;
      text = parts.map(p => {
        if (/^(<[^>]+>|\{\\[^}]*\})$/.test(p)) return p;
        let out = '';
        for (const ch of p.toLocaleLowerCase()) {
          if (capNext && /\p{L}/u.test(ch)) { out += ch.toLocaleUpperCase(); capNext = false; } else out += ch;
          if (/[.!?]/.test(ch)) capNext = true;
        }
        return out.replace(/\bi\b/g, 'I'); // the pronoun "I" (only in text, never inside tags)
      }).join('');
    } else {
      text = parts.map(p => (/^(<[^>]+>|\{\\[^}]*\})$/.test(p) ? p : apply(p))).join('');
    }
    return { ...c, text };
  });
}

/** Remove styling: all <tags>, and {\…} codes (keepPosition keeps a leading {\anN}). */
export function removeFormatting(cues, { keepPosition = true } = {}, ids) {
  return mapCues(cues, ids, c => {
    const [pos, body] = splitPos(c.text);
    const t = body.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');
    return { ...c, text: (keepPosition ? pos : '') + tidy(t) };
  });
}

/** Re-break every cue into balanced lines within the limits (from the quality check). */
export function autoLineBreak(cues, { maxLineLength = 42, maxLines = 2 } = {}, ids) {
  return mapCues(cues, ids, c => {
    const t = rebalance(c.text, maxLineLength, maxLines);
    return t ? { ...c, text: t } : c;
  });
}

/** Join each cue's lines into one line. */
export function joinLines(cues, ids) {
  return mapCues(cues, ids, c => ({ ...c, text: c.text.replace(/\s*\n\s*/g, ' ').trim() }));
}

/**
 * Common clean-ups: double spaces, spaces before , . ! ? ; :, missing space after
 * sentence punctuation before a letter, "..." for "…"-like runs, and dialogue
 * dashes written as "-Hi" → "- Hi".
 */
export function fixPunctuation(cues, ids) {
  return mapCues(cues, ids, c => {
    const [pos, body] = splitPos(c.text);
    const t = body.split('\n').map(line => line
      .replace(/[ \t]+([,.!?;:])/g, '$1')
      .replace(/([,!?;])(?=\p{L})/gu, '$1 ')
      .replace(/(\p{Ll})\.(?=\p{Lu})/gu, '$1. ')
      .replace(/\.{4,}/g, '...')
      .replace(/^(\s*(?:<[ibu]>)?)-(?=\S)/, '$1- ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()).join('\n');
    return { ...c, text: pos + t };
  });
}
