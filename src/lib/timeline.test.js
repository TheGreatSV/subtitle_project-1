import {
  tickStep, tickLabel, clampView, zoomAround, snapTime, snapTargets, hitTest, resizeCue, moveCues, MIN_CUE_MS,
} from './timeline';
import { computePeaks, normalizePeaks } from './waveform';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './history';

const C = (id, startMs, endMs) => ({ id, startMs, endMs, text: id });

describe('ruler', () => {
  test('tick step keeps labels apart', () => {
    expect(tickStep(100)).toBe(1000);     // 100 px/s → 1 s = 100 px
    expect(tickStep(10)).toBe(10000);
    expect(tickStep(1000)).toBe(100);
  });
  test('labels', () => {
    expect(tickLabel(65000, 1000)).toBe('1:05');
    expect(tickLabel(65500, 500)).toBe('1:05.5');
    expect(tickLabel(65250, 250)).toBe('1:05.25');
    expect(tickLabel(3723000, 1000)).toBe('1:02:03');
  });
});

describe('view', () => {
  test('clamp and zoom anchor', () => {
    expect(clampView(-50, 10000, 60000)).toBe(0);
    expect(clampView(55000, 10000, 60000)).toBe(50000);
    expect(clampView(5000, 10000, 4000)).toBe(0);
    // anchor at 20s stays at the same pixel when zooming 100 → 200 px/s from view 10s
    const vs = zoomAround(10000, 100, 200, 20000);
    expect(((20000 - vs) / 1000) * 200).toBeCloseTo(((20000 - 10000) / 1000) * 100);
  });
});

describe('snapping', () => {
  test('nearest target within threshold', () => {
    expect(snapTime(1040, [1000, 2000], 50)).toEqual({ ms: 1000, snapped: true });
    expect(snapTime(1100, [1000, 2000], 50)).toEqual({ ms: 1100, snapped: false });
    expect(snapTargets([C('a', 0, 1000), C('b', 2000, 3000)], new Set(['a']), [500])).toEqual([500, 2000, 3000]);
  });
});

describe('hit test', () => {
  const cues = [C('a', 1000, 2000), C('b', 2000, 3000), C('tiny', 5000, 5020)];
  test('edges, bodies, empty', () => {
    expect(hitTest(cues, 1500, 100)).toEqual({ kind: 'body', id: 'a' });
    expect(hitTest(cues, 1030, 100)).toEqual({ kind: 'start', id: 'a' });  // 3px from the edge
    expect(hitTest(cues, 4000, 100)).toBeNull();
  });
  test('shared edge prefers the selected cue', () => {
    expect(hitTest(cues, 2000, 100, { priority: 'b' })).toEqual({ kind: 'start', id: 'b' });
    expect(hitTest(cues, 2000, 100, { priority: 'a' })).toEqual({ kind: 'end', id: 'a' });
  });
  test('tiny cues are grabbed by body unless selected', () => {
    expect(hitTest(cues, 5010, 100).kind).toBe('body');
    expect(hitTest(cues, 5020, 100, { priority: 'tiny' }).kind).toBe('end');
  });
});

describe('editing', () => {
  const cues = [C('a', 1000, 2000), C('b', 3000, 4000)];
  test('resize keeps a minimum length and never goes negative', () => {
    expect(resizeCue(cues, 'a', 'start', 1950)[0]).toMatchObject({ startMs: 2000 - MIN_CUE_MS, endMs: 2000 });
    expect(resizeCue(cues, 'a', 'start', -500)[0].startMs).toBe(0);
    expect(resizeCue(cues, 'a', 'end', 1020)[0].endMs).toBe(1000 + MIN_CUE_MS);
    expect(resizeCue(cues, 'a', 'end', 2600.4)[0].endMs).toBe(2600);
  });
  test('move group, stopping at zero', () => {
    const both = new Set(['a', 'b']);
    expect(moveCues(cues, both, 500).map(c => c.startMs)).toEqual([1500, 3500]);
    expect(moveCues(cues, both, -5000).map(c => c.startMs)).toEqual([0, 2000]);
    expect(moveCues(cues, new Set(['b']), -100)[0]).toBe(cues[0]);
  });
});

describe('peaks', () => {
  test('min/max per bucket, mono mix, normalised', () => {
    const sr = 800; // 8 samples per 10ms bucket at 100 peaks/s
    const l = new Float32Array(16); const r = new Float32Array(16);
    l[2] = 0.5; r[2] = 0.3;   // bucket 0 max = 0.4
    l[10] = -0.2; r[10] = -0.2; // bucket 1 min = -0.2
    const p = computePeaks([l, r], sr, 100);
    expect(p.length).toBe(4);
    expect(p[1]).toBeCloseTo(0.4);
    expect(p[2]).toBeCloseTo(-0.2);
    const n = normalizePeaks(p);
    expect(Math.max(...Array.from(n).map(Math.abs))).toBeCloseTo(0.95);
  });
});

describe('history: drag sessions', () => {
  test('a slow drag is still one undo step', () => {
    const { result } = renderHook(() => useHistory([0]));
    const realNow = Date.now;
    let t = 1000;
    Date.now = () => t;
    try {
      act(() => result.current.set([1], 'Move', 'drag:1'));
      t += 5000; // user paused mid-drag
      act(() => result.current.set([2], 'Move', 'drag:1'));
      act(() => result.current.set([3], 'Move', 'drag:2')); // next drag
    } finally { Date.now = realNow; }
    act(() => result.current.undo());
    expect(result.current.value).toEqual([2]);
    act(() => result.current.undo());
    expect(result.current.value).toEqual([0]);
  });
});
