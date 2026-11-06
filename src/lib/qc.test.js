import { checkCues, applyFixes, rebalance, summarize, levelsById, PRESETS, DEFAULT_SETTINGS } from './qc';

const C = (id, startMs, endMs, text = 'Hello') => ({ id, startMs, endMs, text });
const rules = (issues, id) => issues.filter(i => i.id === id).map(i => i.rule).sort();

describe('checkCues', () => {
  const cues = [
    C('a', 0, 2000, 'Fine cue'),
    C('b', 1900, 3000, 'Overlaps a? no — a overlaps b'),
    C('c', 3040, 3500, 'Short and close'),             // gap 40ms after b, 460ms long
    C('d', 3600, 4100, 'x'.repeat(30)),                 // 30 chars in 0.5s = 60 cps
    C('e', 5000, 13000, 'This line is definitely far longer than forty-two characters'),
    C('f', 14000, 15000, '  spaced  out '),
    C('g', 15500, 16500, 'spaced  out'),
    C('h', 17000, 18000, '<i></i>'),
    C('i', 16000, 16500, 'One\nTwo\nThree'),
    C('j', 19000, 19000, 'Zero'),
  ];
  const issues = checkCues(cues, DEFAULT_SETTINGS);

  test('per-cue rules', () => {
    expect(rules(issues, 'a')).toEqual(['overlap']);
    expect(rules(issues, 'b')).toEqual(['cps', 'gap']);
    expect(rules(issues, 'c')).toEqual(['cps', 'short']); // 15 chars in 0.46s ≈ 33 CPS
    expect(rules(issues, 'd')).toEqual(['cps', 'short']);
    expect(rules(issues, 'e')).toEqual(['lineLength', 'long']);
    expect(rules(issues, 'f')).toEqual(['spacing']);
    expect(rules(issues, 'g')).toEqual(['duplicate', 'spacing']);
    expect(rules(issues, 'h')).toEqual(['empty']);              // tags only = empty
    expect(rules(issues, 'i')).toEqual(['cps', 'lines', 'order', 'short']); // 0.5s long
    expect(rules(issues, 'j')).toEqual(['timing']);
  });

  test('relaxed preset is quieter', () => {
    const relaxed = checkCues(cues, PRESETS.relaxed);
    expect(relaxed.length).toBeLessThan(issues.length);
    expect(relaxed.some(i => i.rule === 'gap')).toBe(false);   // gap check off
    expect(relaxed.some(i => i.id === 'i' && i.rule === 'lines')).toBe(false); // 3 lines allowed
  });

  test('summary + levels', () => {
    const s = summarize(issues);
    expect(s.errors).toBeGreaterThan(0);
    expect(s.byRule.cps).toBe(4); // b, c, d, i
    const lv = levelsById(issues);
    expect(lv.get('a')).toBe('error');
    expect(lv.get('c')).toBe('warning');
    expect(lv.get('f')).toBe('info');
    expect(lv.has('zzz')).toBe(false);
  });

  test('a setting of 0 turns a check off', () => {
    const none = checkCues([C('x', 0, 100, 'x'.repeat(80))], { ...DEFAULT_SETTINGS, maxCps: 0, minDurationMs: 0, maxLineLength: 0 });
    expect(none).toEqual([]);
  });
});

describe('rebalance', () => {
  test('two even lines within the limit', () => {
    const t = rebalance('This line is definitely far longer than forty-two characters', 42, 2);
    const lines = t.split('\n');
    expect(lines).toHaveLength(2);
    expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(42);
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThan(12);
  });
  test('joins short lines, keeps position code, null when impossible', () => {
    expect(rebalance('{\\an8}One\nTwo\nThree', 42, 2)).toBe('{\\an8}One Two Three');
    expect(rebalance('x'.repeat(50), 42, 2)).toBeNull();
  });
});

describe('applyFixes', () => {
  const s = DEFAULT_SETTINGS;
  test('overlap / gap trimmed to the minimum gap', () => {
    const { cues, fixed } = applyFixes([C('a', 0, 2000), C('b', 1900, 3000), C('c', 3040, 4000)], s, { rules: new Set(['overlap', 'gap']) });
    expect(fixed).toBe(2);
    expect(cues[0].endMs).toBe(1900 - 83);
    expect(cues[1].endMs).toBe(3040 - 83);
  });
  test('short extended but never into the next cue', () => {
    const { cues } = applyFixes([C('a', 0, 300), C('b', 500, 2000), C('c', 5000, 5200)], s, { rules: new Set(['short']) });
    expect(cues[0].endMs).toBe(500 - 83);
    expect(cues[2].endMs).toBe(5833);
  });
  test('order, spacing, empty, duplicate, lines', () => {
    const { cues } = applyFixes([
      C('b', 3000, 4000, ' Hi  there '),
      C('a', 0, 1000, 'This line is definitely far longer than forty-two characters'),
      C('e', 1500, 2000, ''),
      C('d1', 5000, 6000, 'Same'),
      C('d2', 6200, 7000, 'Same'),
    ], s);
    expect(cues.map(c => c.id)).toEqual(['a', 'b', 'd1']);
    expect(cues[0].text.split('\n')).toHaveLength(2);
    expect(cues[1].text).toBe('Hi there');
    expect(cues[2]).toMatchObject({ startMs: 5000, endMs: 7000 });
  });
  test('ids limit scope; nothing to fix returns same array', () => {
    const list = [C('a', 0, 2000), C('b', 1900, 3000), C('c', 2900, 4000)];
    const { cues } = applyFixes(list, s, { rules: new Set(['overlap']), ids: new Set(['b']) });
    expect(cues[0].endMs).toBe(2000);
    expect(cues[1].endMs).toBe(2900 - 83);
    const ok = [C('a', 0, 2000, 'Fine')];
    expect(applyFixes(ok, s).cues).toBe(ok);
  });
  test('after fix-all, only unfixable issues remain', () => {
    const list = [C('a', 0, 2000), C('b', 1900, 2200), C('c', 2000, 3000, 'a  b')];
    const { cues } = applyFixes(list, s);
    const left = checkCues(cues, s).filter(i => !['cps', 'long', 'timing'].includes(i.rule));
    expect(left.filter(i => i.rule !== 'short' && i.rule !== 'duplicate')).toEqual([]);
  });
});
