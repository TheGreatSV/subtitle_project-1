import { readingMs, typedCueRange, stepSpeed, loopRangeFor, MIN_TYPED_MS } from './typing';

describe('typed cue timing', () => {
  test('uses the captured end when there is enough time', () => {
    expect(typedCueRange(1000, 3400, 'Hello')).toEqual({ startMs: 1000, endMs: 3400 });
  });
  test('falls back to reading time when the end is too close, missing or earlier', () => {
    expect(typedCueRange(1000, 1000 + MIN_TYPED_MS - 1, 'Hi')).toEqual({ startMs: 1000, endMs: 2000 });
    expect(typedCueRange(5000, 4000, 'x'.repeat(30))).toEqual({ startMs: 5000, endMs: 7000 });
    expect(typedCueRange(0, undefined, 'x'.repeat(300))).toEqual({ startMs: 0, endMs: 7000 });
  });
  test('reading time ignores tags and is clamped', () => {
    expect(readingMs('<i>Hi</i>')).toBe(1000);
    expect(readingMs('x'.repeat(45))).toBe(3000);
  });
});

describe('speed steps', () => {
  test('up, down and limits', () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(2, 1)).toBe(2);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
    expect(stepSpeed(1.1, 1)).toBe(1.5); // off-list value snaps to the next step
  });
});

describe('loop range', () => {
  const cues = [{ id: 'a', startMs: 1000, endMs: 2000 }, { id: 'b', startMs: 3000, endMs: 5000 }];
  test('primary cue, multi-selection span, nothing', () => {
    expect(loopRangeFor(cues, new Set(['a']), 'a')).toEqual({ startMs: 1000, endMs: 2000 });
    expect(loopRangeFor(cues, new Set(['a', 'b']), 'b')).toEqual({ startMs: 1000, endMs: 5000 });
    expect(loopRangeFor(cues, new Set(), null)).toBeNull();
  });
});
