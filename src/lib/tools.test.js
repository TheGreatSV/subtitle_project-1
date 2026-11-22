import {
  convertFrameRate, twoPointSync, removeHearingImpaired, changeCase, removeFormatting,
  autoLineBreak, joinLines, fixPunctuation, diffCues,
} from './tools';

const C = (id, startMs, endMs, text = id) => ({ id, startMs, endMs, text });
const texts = (cues) => cues.map(c => c.text);

describe('sync', () => {
  test('frame-rate conversion scales by from/to', () => {
    const out = convertFrameRate([C('a', 25000, 50000)], 25, 23.976);
    expect(out[0].startMs).toBe(Math.round(25000 * 25 / 23.976));
    expect(convertFrameRate([C('a', 1000, 2000)], 25, 25)).toEqual([C('a', 1000, 2000)]);
  });
  test('frame-rate respects scope', () => {
    const list = [C('a', 1000, 2000), C('b', 3000, 4000)];
    const out = convertFrameRate(list, 25, 24, new Set(['b']));
    expect(out[0]).toBe(list[0]);
    expect(out[1].startMs).toBe(3125);
  });
  test('two-point sync maps both anchors exactly and interpolates', () => {
    const list = [C('a', 10000, 12000), C('m', 55000, 57000), C('b', 100000, 102000)];
    const r = twoPointSync(list, { fromMs: 10000, toMs: 11000 }, { fromMs: 100000, toMs: 104000 });
    expect(r.cues[0].startMs).toBe(11000);
    expect(r.cues[2].startMs).toBe(104000);
    expect(r.cues[1].startMs).toBe(Math.round(11000 + 45000 * (93000 / 90000)));
    expect(r.scale).toBeCloseTo(93000 / 90000);
  });
  test('two-point sync rejects bad points', () => {
    const list = [C('a', 0, 1)];
    expect(twoPointSync(list, { fromMs: 5, toMs: 5 }, { fromMs: 5, toMs: 9 })).toBeNull();
    expect(twoPointSync(list, { fromMs: 0, toMs: 10 }, { fromMs: 10, toMs: 0 })).toBeNull();
  });
});

describe('hearing-impaired removal', () => {
  const all = { brackets: true, parens: true, speakers: true, music: true };
  test('removes annotations, keeps dialogue, drops emptied cues', () => {
    const list = [
      C('a', 0, 1, '[door slams]'),
      C('b', 1, 2, 'JOHN: Where are you?\n(whispering) Over here.'),
      C('c', 2, 3, '- (laughs)\n- That was close.'),
      C('d', 3, 4, '♪ la la la ♪'),
      C('e', 4, 5, '{\\an8}<i>[on TV]</i> News at ten'),
      C('f', 5, 6, 'Nothing to remove here'),
    ];
    const out = removeHearingImpaired(list, all);
    expect(out.map(c => c.id)).toEqual(['b', 'c', 'e', 'f']);
    expect(texts(out)).toEqual(['Where are you?\nOver here.', '- That was close.', '{\\an8}News at ten', 'Nothing to remove here']);
    expect(out[3]).toBe(list[5]);
  });
  test('options are independent', () => {
    const out = removeHearingImpaired([C('a', 0, 1, '[noise] (sigh) Hi')], { brackets: true });
    expect(out[0].text).toBe('(sigh) Hi');
  });
  test('time stamps in text are not speaker names', () => {
    const list = [C('a', 0, 1, 'Meet at 10:30 OK')];
    expect(removeHearingImpaired(list, all)).toBe(list);
  });
});

describe('text', () => {
  test('case: upper / lower / sentence, tags kept', () => {
    const list = [C('a', 0, 1, '{\\an8}<i>hello THERE.</i> i am here! ok')];
    expect(changeCase(list, 'upper')[0].text).toBe('{\\an8}<i>HELLO THERE.</i> I AM HERE! OK');
    expect(changeCase(list, 'lower')[0].text).toBe('{\\an8}<i>hello there.</i> i am here! ok');
    expect(changeCase(list, 'sentence')[0].text).toBe('{\\an8}<i>Hello there.</i> I am here! Ok');
  });
  test('remove formatting keeps position by default', () => {
    const list = [C('a', 0, 1, '{\\an8}<i>Hi</i> <font color="red">there</font>{\\b1}')];
    expect(removeFormatting(list)[0].text).toBe('{\\an8}Hi there');
    expect(removeFormatting(list, { keepPosition: false })[0].text).toBe('Hi there');
  });
  test('line break and join', () => {
    const long = 'This line is definitely far longer than forty-two characters';
    const out = autoLineBreak([C('a', 0, 1, long)], { maxLineLength: 42, maxLines: 2 });
    expect(out[0].text.split('\n')).toHaveLength(2);
    expect(joinLines(out)[0].text).toBe(long);
  });
  test('punctuation fixes', () => {
    const out = fixPunctuation([C('a', 0, 1, 'Wait ,what ?Really.....\n-Yes.No  way')]);
    expect(out[0].text).toBe('Wait, what? Really...\n- Yes. No way');
  });
  test('decimals and times are left alone', () => {
    const list = [C('a', 0, 1, 'It costs 3.50 at 10:30')];
    expect(fixPunctuation(list)).toBe(list);
  });
  test('unchanged input returns the same array (no empty undo steps)', () => {
    const list = [C('a', 0, 1, 'Fine.')];
    expect(changeCase(list, 'sentence')).toBe(list);
    expect(joinLines(list)).toBe(list);
  });
});

describe('diff', () => {
  test('changed and removed cues', () => {
    const before = [C('a', 0, 1, 'x'), C('b', 1, 2, 'y'), C('c', 2, 3, 'z')];
    const after = [before[0], { ...before[1], text: 'Y' }];
    expect(diffCues(before, after).map(d => [d.index, d.after && d.after.text])).toEqual([[1, 'Y'], [2, null]]);
  });
});
