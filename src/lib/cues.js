/**
 * cues.js — the cue data model and SRT/VTT conversion.
 *
 * A cue is: { id: string, startMs: number, endMs: number, text: string }
 * One array of these replaces the old parallel `Entries` + `Divs` arrays.
 * `id` is stable for the life of the cue, so React keys, selection and
 * highlights no longer depend on array position.
 */
import { parseTime, formatTime, formatVttTime } from './time';

let counter = 0;
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  counter += 1;
  return `c${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function makeCue({ startMs = 0, endMs = 0, text = '' } = {}) {
  return { id: newId(), startMs: Math.max(0, Math.round(startMs)), endMs: Math.max(0, Math.round(endMs)), text: String(text) };
}

/** Sanity-check a value loaded from storage; drops anything malformed. */
export function normalizeCues(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(c => c && Number.isFinite(c.startMs) && Number.isFinite(c.endMs))
    .map(c => ({ id: c.id || newId(), startMs: c.startMs, endMs: c.endMs, text: String(c.text ?? '') }));
}

/** Old localStorage shape: [{ startTime: "00:00:01,000", endTime: "...", Text: "..." }] */
export function fromLegacyEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(e => {
      const startMs = parseTime(e?.startTime);
      const endMs = parseTime(e?.endTime);
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
      return makeCue({ startMs, endMs, text: e.Text ?? e.text ?? '' });
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// SRT
// ---------------------------------------------------------------------------

const ARROW_RE = /^\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})/;

/**
 * Parse SRT text into cues. Tolerant of: BOM, CRLF/CR line endings,
 * missing or wrong index numbers, "." instead of ",", extra blank lines,
 * and position info after the timestamps.
 */
export function parseSrt(content) {
  const lines = String(content).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(ARROW_RE);
    if (!m) { i += 1; continue; }
    const startMs = parseTime(m[1]);
    const endMs = parseTime(m[2]);
    i += 1;
    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      // A bare number followed by a timestamp line means the blank separator was missing.
      if (/^\d+\s*$/.test(lines[i]) && ARROW_RE.test(lines[i + 1] || '')) break;
      if (ARROW_RE.test(lines[i])) break;
      textLines.push(lines[i]);
      i += 1;
    }
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
      cues.push(makeCue({ startMs, endMs, text: textLines.join('\n').trim() }));
    }
  }
  return cues;
}

export function cuesToSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${formatTime(c.startMs)} --> ${formatTime(c.endMs)}\n${c.text}\n`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// WebVTT (used for the live preview track)
// ---------------------------------------------------------------------------

export function cuesToVtt(cues) {
  const body = cues
    .map((c, i) => `${i + 1}\n${formatVttTime(c.startMs)} --> ${formatVttTime(c.endMs)}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
