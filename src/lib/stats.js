/**
 * stats.js — readability numbers for one cue (used by the live counters).
 * Limits come from the active quality-check settings so the counters and the
 * quality check always agree.
 */
import { DEFAULT_SETTINGS, visibleText } from './qc';

export const LIMITS = {
  maxCps: DEFAULT_SETTINGS.maxCps,
  maxLineLength: DEFAULT_SETTINGS.maxLineLength,
  maxLines: DEFAULT_SETTINGS.maxLines,
  minDurationMs: DEFAULT_SETTINGS.minDurationMs,
  maxDurationMs: DEFAULT_SETTINGS.maxDurationMs,
};

export function cueStats({ startMs, endMs, text }, limits = LIMITS) {
  const vis = visibleText(text);
  const lines = vis.split('\n');
  const chars = lines.join('').length;
  const durationMs = Math.max(0, endMs - startMs);
  const cps = durationMs > 0 ? chars / (durationMs / 1000) : chars ? Infinity : 0;
  const maxLineLength = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const on = (v) => v > 0; // a limit of 0 means "off"
  return {
    durationMs,
    chars,
    cps,
    lineCount: vis ? lines.length : 0,
    maxLineLength,
    flags: {
      cps: on(limits.maxCps) && cps > limits.maxCps,
      lineLength: on(limits.maxLineLength) && maxLineLength > limits.maxLineLength,
      lines: on(limits.maxLines) && lines.length > limits.maxLines,
      tooShort: on(limits.minDurationMs) && durationMs > 0 && durationMs < limits.minDurationMs,
      tooLong: on(limits.maxDurationMs) && durationMs > limits.maxDurationMs,
    },
  };
}
