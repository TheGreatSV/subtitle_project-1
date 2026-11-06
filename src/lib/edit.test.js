import { renderHook, act } from '@testing-library/react';
import {
  insertByStart, selectionRange, mergeRange, splitCue, nudgeCues, setCueEdge, newCueAt,
  buildMatcher, findMatches, replaceInCues,
} from './edit';
import { cueStats } from './stats';
import { useHistory } from './history';

const C = (id, startMs, endMs, text = id) => ({ id, startMs, endMs, text });
const base = () => [C('a', 0, 1000, 'Hello there'), C('b', 1000, 2000, 'General'), C('c', 3000, 4000, 'Kenobi')];

describe('selection + merge', () => {
  test('range and contiguity', () => {
    expect(selectionRange(base(), new Set(['a', 'b']))).toMatchObject({ lo: 0, hi: 1, contiguous: true, count: 2 });
    expect(selectionRange(base(), new Set(['a', 'c']))).toMatchObject({ lo: 0, hi: 2, contiguous: false });
    expect(selectionRange(base(), new Set())).toBeNull();
  });
  test('merge a range', () => {
    const { cues, mergedId } = mergeRange(base(), 0, 2);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ id: 'a', startMs: 0, endMs: 4000, text: 'Hello there General Kenobi' });
    expect(mergedId).toBe('a');
    expect(mergeRange(base(), 2, 3)).toBeNull();
  });
  test('merge keeps line breaks when parts are multi-line', () => {
    const { cues } = mergeRange([C('a', 0, 1, 'one\ntwo'), C('b', 1, 2, 'three')], 0, 1);
    expect(cues[0].text).toBe('one\ntwo\nthree');
  });
});

describe('split', () => {
  test('at caret and playhead', () => {
    const [x, y] = splitCue(C('a', 0, 1000, 'Hello there'), { atMs: 400, textIndex: 5 });
    expect(x).toMatchObject({ id: 'a', endMs: 400, text: 'Hello' });
    expect(y).toMatchObject({ startMs: 400, endMs: 1000, text: 'there' });
    expect(y.id).not.toBe('a');
  });
  test('playhead outside the cue → proportional time, middle word', () => {
    const [x, y] = splitCue(C('a', 0, 1000, 'one two three four'), { atMs: 5000 });
    expect(x.text).toBe('one two');
    expect(y.text).toBe('three four');
    expect(x.endMs).toBeGreaterThan(0);
    expect(x.endMs).toBeLessThan(1000);
  });
  test('too short', () => {
    expect(splitCue(C('a', 0, 1, 'x'))).toBeNull();
  });
});

describe('timing', () => {
  test('nudge both keeps duration at zero', () => {
    const out = nudgeCues(base(), new Set(['a']), -500);
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 1000 });
    expect(out[1]).toMatchObject({ startMs: 1000, endMs: 2000 }); // others untouched
    expect(nudgeCues(base(), new Set(['b']), 250)[1]).toMatchObject({ startMs: 1250, endMs: 2250 });
  });
  test('nudge end never before start', () => {
    expect(nudgeCues(base(), new Set(['a']), -5000, 'end')[0]).toMatchObject({ startMs: 0, endMs: 0 });
  });
  test('set edge', () => {
    expect(setCueEdge(base(), 'b', 'start', 1500)[1]).toMatchObject({ startMs: 1500, endMs: 2000 });
    expect(setCueEdge(base(), 'b', 'start', 2500)[1]).toMatchObject({ startMs: 2500, endMs: 3500 });
    expect(setCueEdge(base(), 'b', 'end', 2500)[1]).toMatchObject({ endMs: 2500 });
    expect(setCueEdge(base(), 'b', 'end', 900)).toBeNull();
  });
  test('new cue stops at the next cue', () => {
    expect(newCueAt(base(), 2000)).toMatchObject({ startMs: 2000, endMs: 3000, text: '' });
    expect(newCueAt(base(), 5000)).toMatchObject({ startMs: 5000, endMs: 7000 });
    expect(newCueAt(base(), 2800)).toMatchObject({ startMs: 2800, endMs: 4800 }); // next is <500ms away → default length
  });
  test('insert by start', () => {
    expect(insertByStart(base(), C('x', 2500, 2600)).map(c => c.id)).toEqual(['a', 'b', 'x', 'c']);
  });
});

describe('find & replace', () => {
  const cues = [C('a', 0, 1, 'The cat sat'), C('b', 1, 2, 'Concatenate'), C('c', 2, 3, 'CAT $5')];
  test('case-insensitive by default', () => {
    expect(findMatches(cues, buildMatcher('cat')).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });
  test('whole word and case', () => {
    expect(findMatches(cues, buildMatcher('cat', { wholeWord: true })).map(m => m.id)).toEqual(['a', 'c']);
    expect(findMatches(cues, buildMatcher('cat', { caseSensitive: true, wholeWord: true })).map(m => m.id)).toEqual(['a']);
  });
  test('whole word works for non-Latin scripts', () => {
    const ml = [C('m', 0, 1, 'ഞാൻ വരാം'), C('n', 1, 2, 'ഞാൻപോകാം')];
    expect(findMatches(ml, buildMatcher('ഞാൻ', { wholeWord: true })).map(m => m.id)).toEqual(['m']);
  });
  test('literal replace treats $ literally; regex replace supports groups', () => {
    const lit = replaceInCues(cues, buildMatcher('cat'), 'd$1g');
    expect(lit.cues[0].text).toBe('The d$1g sat');
    expect(lit.count).toBe(3);
    const rx = replaceInCues(cues, buildMatcher('(\\$)(\\d)', { regex: true }), '$2$1', { regex: true });
    expect(rx.cues[2].text).toBe('CAT 5$');
  });
  test('replace limited to ids', () => {
    const r = replaceInCues(cues, buildMatcher('cat'), 'dog', { ids: new Set(['b']) });
    expect(r.cues.map(c => c.text)).toEqual(['The cat sat', 'Condogenate', 'CAT $5']);
  });
  test('invalid regex throws; empty query gives null', () => {
    expect(() => buildMatcher('(', { regex: true })).toThrow();
    expect(buildMatcher('')).toBeNull();
  });
});

describe('stats', () => {
  test('cps, lines, flags', () => {
    const s = cueStats({ startMs: 0, endMs: 1000, text: 'Hello\nworld, this line is definitely longer than forty-two chars' });
    expect(s.lineCount).toBe(2);
    expect(s.maxLineLength).toBeGreaterThan(42);
    expect(s.flags.lineLength).toBe(true);
    expect(s.flags.cps).toBe(true);
    expect(cueStats({ startMs: 0, endMs: 2000, text: 'Hi' }).flags.cps).toBe(false);
  });
});

describe('history', () => {
  test('undo / redo / coalesce / reset', () => {
    const { result } = renderHook(() => useHistory([1]));
    act(() => result.current.set([1, 2], 'Add'));
    act(() => result.current.set(v => [...v, 3], 'Add'));
    expect(result.current.value).toEqual([1, 2, 3]);
    act(() => result.current.undo());
    expect(result.current.value).toEqual([1, 2]);
    expect(result.current.redoLabel).toBe('Add');
    act(() => result.current.redo());
    expect(result.current.value).toEqual([1, 2, 3]);

    act(() => result.current.set([9], 'Nudge', 'k'));
    act(() => result.current.set([10], 'Nudge', 'k'));
    act(() => result.current.undo());
    expect(result.current.value).toEqual([1, 2, 3]); // two nudges = one step

    act(() => result.current.reset(['fresh']));
    expect(result.current.canUndo).toBe(false);
  });
});
