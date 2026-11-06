/**
 * formats.js — read and write subtitle formats.
 *
 * Internal text convention (same as SRT): line breaks are "\n", styling uses
 * <i> <b> <u> tags, and an optional leading {\anN} sets the position.
 *
 * Import:  SRT, WebVTT, ASS/SSA, SBV (YouTube), plain TXT (auto-timed)
 * Export:  SRT, WebVTT, ASS, SBV, TXT, CSV
 */
import { makeCue, parseSrt } from './cues';
import { formatTime } from './time';

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/** Decode file bytes: honour a BOM, else UTF-8, else fall back to Windows-1252. */
export function decodeBytes(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'UTF-8' };
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16 LE' };
  if (b[0] === 0xFE && b[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16 BE' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(b), encoding: 'Windows-1252' };
  }
}

export async function readTextFile(file) {
  return decodeBytes(await file.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Format registry
// ---------------------------------------------------------------------------

export const FORMATS = {
  srt: { label: 'SubRip (.srt)', ext: 'srt', mime: 'application/x-subrip', note: 'Works almost everywhere — YouTube, VLC, editors, TVs.' },
  vtt: { label: 'WebVTT (.vtt)', ext: 'vtt', mime: 'text/vtt', note: 'For web video players (HTML5 <track>, Vimeo, JW Player).' },
  ass: { label: 'Advanced SubStation (.ass)', ext: 'ass', mime: 'text/x-ssa', note: 'For Aegisub, mpv and burning styled subtitles with FFmpeg.' },
  sbv: { label: 'YouTube SubViewer (.sbv)', ext: 'sbv', mime: 'text/plain', note: 'YouTube’s older caption format.' },
  txt: { label: 'Plain text (.txt)', ext: 'txt', mime: 'text/plain', note: 'Just the words, one cue per line — a transcript.' },
  csv: { label: 'Spreadsheet (.csv)', ext: 'csv', mime: 'text/csv', note: 'Opens in Excel / Google Sheets for review or translation.' },
};

export const IMPORT_ACCEPT = '.srt,.vtt,.webvtt,.ass,.ssa,.sbv,.sub,.txt,text/plain,text/vtt';

const EXT_TO_FORMAT = { srt: 'srt', vtt: 'vtt', webvtt: 'vtt', ass: 'ass', ssa: 'ass', sbv: 'sbv', sub: 'sbv', txt: 'txt' };

/** Guess the format from content first (extensions lie), then the file name. */
export function detectFormat(text, fileName = '') {
  const head = text.replace(/^﻿/, '').slice(0, 4000);
  if (/^WEBVTT/.test(head.trimStart())) return 'vtt';
  if (/^\s*\[Script Info\]/im.test(head) || /^\s*Dialogue:/m.test(head)) return 'ass';
  if (/^\s*\d+:\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*\d+:\d{2}:\d{2}[.,]\d{1,3}/m.test(head)) return 'srt';
  if (/^\s*\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}\s*$/m.test(head)) return 'sbv';
  if (/-->/.test(head)) return 'vtt'; // VTT without the header and with mm:ss times
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  return EXT_TO_FORMAT[ext] || 'txt';
}

const normalizeNewlines = (s) => String(s).replace(/^﻿/, '').replace(/\r\n?/g, '\n');

const decodeEntities = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

const VTT_TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const VTT_ARROW = new RegExp(`^\\s*${VTT_TIME.source}\\s*-->\\s*${VTT_TIME.source}`);

function vttMs(h, m, s, ms) {
  return (+(h || 0)) * 3600000 + (+m) * 60000 + (+s) * 1000 + +String(ms).padEnd(3, '0');
}

/** Keep <i>/<b>/<u>, drop voice/class/timestamp tags, decode entities. */
function cleanVttText(t) {
  return decodeEntities(
    t.replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}>/g, '')
      .replace(/<\/?(?:c|v|lang|ruby|rt)(?:[.\s][^>]*)?>/g, '')
  ).trim();
}

export function parseVtt(content) {
  const lines = normalizeNewlines(content).split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip NOTE / STYLE / REGION blocks entirely.
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) {
      while (i < lines.length && lines[i].trim() !== '') i += 1;
      continue;
    }
    const m = line.match(VTT_ARROW);
    if (!m) { i += 1; continue; }
    const startMs = vttMs(m[1], m[2], m[3], m[4]);
    const endMs = vttMs(m[5], m[6], m[7], m[8]);
    // Cue settings like "line:10% align:start" → keep a top position hint when it's clearly at the top.
    const settings = line.slice(m[0].length);
    const top = /\bline:(?:0|[0-9](?:\.\d+)?%|1[0-9]%)/.test(settings);
    i += 1;
    const text = [];
    while (i < lines.length && lines[i].trim() !== '' && !VTT_ARROW.test(lines[i])) {
      text.push(lines[i]);
      i += 1;
    }
    const body = cleanVttText(text.join('\n'));
    cues.push(makeCue({ startMs, endMs, text: top && body ? `{\\an8}${body}` : body }));
  }
  return cues;
}

const ASS_TIME = /^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/;
function assMs(t) {
  const m = String(t).trim().match(ASS_TIME);
  if (!m) return NaN;
  const frac = m[4].length === 2 ? +m[4] * 10 : +String(m[4]).padEnd(3, '0');
  return (+m[1]) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + frac;
}

/** ASS override blocks → SRT-style tags. Keeps {\anN}; drops everything else (colours, moves, karaoke…). */
function assTextToInternal(raw) {
  let pos = '';
  let t = raw.replace(/\{([^}]*)\}/g, (_, block) => {
    let out = '';
    const an = block.match(/\\an([1-9])/);
    if (an && !pos) pos = `{\\an${an[1]}}`;
    block.replace(/\\([ibu])(\d?)(?![a-z])/g, (__, tag, n) => {
      out += n === '0' ? `</${tag}>` : `<${tag}>`;
      return '';
    });
    return out;
  });
  t = t.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ');
  t = t.split('\n').map(l => l.trim()).join('\n').trim();
  // Drop tags that were opened but never closed (common: {\i1} with no {\i0}) by closing them at the end.
  ['i', 'b', 'u'].forEach(tag => {
    const opens = (t.match(new RegExp(`<${tag}>`, 'g')) || []).length;
    const closes = (t.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (opens > closes) t += `</${tag}>`.repeat(opens - closes);
  });
  return pos + t;
}

export function parseAss(content) {
  const lines = normalizeNewlines(content).split('\n');
  let inEvents = false;
  let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
  const cues = [];
  for (const line of lines) {
    const sec = line.match(/^\s*\[(.+)\]\s*$/);
    if (sec) { inEvents = sec[1].toLowerCase() === 'events'; continue; }
    if (!inEvents) continue;
    if (/^\s*Format\s*:/i.test(line)) {
      fields = line.replace(/^\s*Format\s*:/i, '').split(',').map(f => f.trim().toLowerCase());
      continue;
    }
    const d = line.match(/^\s*Dialogue\s*:\s?(.*)$/i);
    if (!d) continue; // Comment:, Picture:, etc.
    const parts = d[1].split(',');
    const textIdx = fields.indexOf('text');
    const head = parts.slice(0, textIdx);
    const text = parts.slice(textIdx).join(',');
    const startMs = assMs(head[fields.indexOf('start')]);
    const endMs = assMs(head[fields.indexOf('end')]);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    if (/\\p[1-9]/.test(text)) continue; // vector drawings aren't text
    cues.push(makeCue({ startMs, endMs, text: assTextToInternal(text) }));
  }
  // ASS files are often not in time order (sorted by layer/style); a stable sort fixes that.
  return cues.map((c, i) => [c, i]).sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map(([c]) => c);
}

const SBV_ARROW = /^\s*(\d+):(\d{2}):(\d{2})\.(\d{1,3})\s*,\s*(\d+):(\d{2}):(\d{2})\.(\d{1,3})\s*$/;

export function parseSbv(content) {
  const lines = normalizeNewlines(content).split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(SBV_ARROW);
    if (!m) { i += 1; continue; }
    i += 1;
    const text = [];
    while (i < lines.length && lines[i].trim() !== '') { text.push(lines[i]); i += 1; }
    cues.push(makeCue({
      startMs: vttMs(m[1], m[2], m[3], m[4]),
      endMs: vttMs(m[5], m[6], m[7], m[8]),
      text: text.join('\n').replace(/\[br\]/gi, '\n').trim(),
    }));
  }
  return cues;
}

/**
 * Plain text → cues with estimated timing. Paragraphs (blank-line separated)
 * become cues; if there are no blank lines, every line is a cue. Each cue gets a
 * reading-speed duration (15 chars/s, 1–7s) with a short gap, so the result is a
 * starting point to re-time against the video.
 */
export function parseTxt(content) {
  const text = normalizeNewlines(content).trim();
  if (!text) return [];
  const blocks = /\n\s*\n/.test(text)
    ? text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    : text.split('\n').map(l => l.trim()).filter(Boolean);
  let t = 0;
  return blocks.map(b => {
    const dur = Math.min(7000, Math.max(1000, Math.round((b.replace(/\n/g, '').length / 15) * 1000)));
    const cue = makeCue({ startMs: t, endMs: t + dur, text: b });
    t += dur + 100;
    return cue;
  });
}

/** Parse any supported subtitle text. Returns { format, cues }. */
export function parseSubtitles(text, fileName = '') {
  const format = detectFormat(text, fileName);
  const parsers = { srt: parseSrt, vtt: parseVtt, ass: parseAss, sbv: parseSbv, txt: parseTxt };
  return { format, cues: parsers[format](text) };
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const stripTags = (t) => t.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '');
const pad = (n, w = 2) => String(n).padStart(w, '0');

function splitMs(ms) {
  ms = Math.max(0, Math.round(ms));
  return { h: Math.floor(ms / 3600000), m: Math.floor((ms % 3600000) / 60000), s: Math.floor((ms % 60000) / 1000), ms: ms % 1000 };
}

const vttTime = (ms) => formatTime(ms, '.');
const sbvTime = (ms) => { const t = splitMs(ms); return `${t.h}:${pad(t.m)}:${pad(t.s)}.${pad(t.ms, 3)}`; };
const assTime = (ms) => { const t = splitMs(Math.round(ms / 10) * 10); return `${t.h}:${pad(t.m)}:${pad(t.s)}.${pad(Math.floor(t.ms / 10))}`; };

const escapeVtt = (t) => t.replace(/&/g, '&amp;').replace(/<(?!\/?[ibu]>)/g, '&lt;');

function toVttText(text) {
  const m = text.match(/^\{\\an([1-9])\}/);
  const body = text.replace(/^\{\\an[1-9]\}/, '').replace(/<\/?font[^>]*>/gi, '');
  return { body: escapeVtt(body), settings: m && +m[1] >= 7 ? ' line:0' : '' };
}

function toAssText(text) {
  return text
    .replace(/<(\/?)([ibu])>/gi, (_, close, tag) => `{\\${tag.toLowerCase()}${close ? 0 : 1}}`)
    .replace(/<[^>]+>/g, '')
    .replace(/\n/g, '\\N');
}

const csvCell = (v) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const writers = {
  srt: (cues) => cues.map((c, i) => `${i + 1}\n${formatTime(c.startMs)} --> ${formatTime(c.endMs)}\n${c.text}\n`).join('\n'),

  vtt: (cues) => 'WEBVTT\n\n' + cues.map((c, i) => {
    const { body, settings } = toVttText(c.text);
    return `${i + 1}\n${vttTime(c.startMs)} --> ${vttTime(c.endMs)}${settings}\n${body}\n`;
  }).join('\n'),

  ass: (cues, { title = 'Subtitles' } = {}) => [
    '[Script Info]',
    `Title: ${title}`,
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,60,60,50,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...cues.map(c => `Dialogue: 0,${assTime(c.startMs)},${assTime(c.endMs)},Default,,0,0,0,,${toAssText(c.text)}`),
    '',
  ].join('\n'),

  sbv: (cues) => cues.map(c => `${sbvTime(c.startMs)},${sbvTime(c.endMs)}\n${stripTags(c.text)}\n`).join('\n'),

  txt: (cues) => cues.map(c => stripTags(c.text).replace(/\s*\n\s*/g, ' ').trim()).join('\n') + '\n',

  csv: (cues) => [
    ['Index', 'Start', 'End', 'Duration (s)', 'Text'].join(','),
    ...cues.map((c, i) => [i + 1, formatTime(c.startMs), formatTime(c.endMs), ((c.endMs - c.startMs) / 1000).toFixed(3), csvCell(c.text)].join(',')),
  ].join('\n') + '\n',
};

/**
 * Serialize cues. options: { eol: 'lf' | 'crlf', bom: boolean, title }
 * Returns the file contents as a string (BOM included when asked).
 */
export function writeSubtitles(cues, format, { eol = 'lf', bom = false, title } = {}) {
  const w = writers[format];
  if (!w) throw new Error(`Unknown format: ${format}`);
  let out = w(cues, { title });
  if (eol === 'crlf') out = out.replace(/\r?\n/g, '\r\n');
  return (bom ? '﻿' : '') + out;
}

/** Default options per format: CSV gets a BOM so Excel reads UTF-8 correctly. */
export function defaultExportOptions(format) {
  return { eol: 'lf', bom: format === 'csv' };
}
