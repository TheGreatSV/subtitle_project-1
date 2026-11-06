import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';
import {
  detectFormat, parseSubtitles, parseVtt, parseAss, parseSbv, parseTxt, writeSubtitles, decodeBytes,
} from './formats';

if (typeof global.TextDecoder === 'undefined') global.TextDecoder = NodeTextDecoder;
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = NodeTextEncoder;

const plain = (cues) => cues.map(({ startMs, endMs, text }) => ({ startMs, endMs, text }));
const sample = [
  { id: 'a', startMs: 1000, endMs: 2500, text: 'Hello <i>there</i>' },
  { id: 'b', startMs: 3000, endMs: 4000, text: 'Two\nlines, with "quotes"' },
  { id: 'c', startMs: 3723456, endMs: 3725000, text: '{\\an8}Top & <b>bold</b>' },
];

describe('detection', () => {
  test.each([
    ['WEBVTT\n\n00:01.000 --> 00:02.000\nHi', 'x.txt', 'vtt'],
    ['[Script Info]\nTitle: x', 'x.txt', 'ass'],
    ['1\n00:00:01,000 --> 00:00:02,000\nHi', 'x.vtt', 'srt'],
    ['0:00:01.000,0:00:02.000\nHi', 'x.txt', 'sbv'],
    ['Just some words', 'notes.txt', 'txt'],
  ])('%#', (text, name, fmt) => expect(detectFormat(text, name)).toBe(fmt));
});

describe('VTT', () => {
  test('header, mm:ss times, settings, NOTE/STYLE, voice + timestamp tags, entities', () => {
    const cues = parseVtt(`WEBVTT - title

STYLE
::cue { color: red }

NOTE this is a comment
spanning lines

intro
00:01.000 --> 00:02.500 align:start
<v Roger>Hi &amp; <i>bye</i></v>

00:00:03.000 --> 00:00:04.000 line:0
<c.yellow>Top</c> <00:00:03.500>line
`);
    expect(plain(cues)).toEqual([
      { startMs: 1000, endMs: 2500, text: 'Hi & <i>bye</i>' },
      { startMs: 3000, endMs: 4000, text: '{\\an8}Top line' },
    ]);
  });
  test('round trip', () => {
    const out = writeSubtitles(sample, 'vtt');
    expect(out).toContain('01:02:03.456 --> 01:02:05.000 line:0');
    expect(out).toContain('Top &amp; <b>bold</b>');
    expect(plain(parseVtt(out))).toEqual(plain(sample));
  });
});

describe('ASS', () => {
  const ass = `[Script Info]
Title: test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:06.50,Default,,0,0,0,,Later, with a comma
Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,ignored
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8\\fs40\\bord2}{\\i1}Italic{\\i0} top\\Nsecond line
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}
Dialogue: 0,0:00:07.00,0:00:08.00,Default,,0,0,0,,{\\b1}never closed
`;
  test('parses, sorts by time, converts tags, skips comments and drawings', () => {
    expect(plain(parseAss(ass))).toEqual([
      { startMs: 1000, endMs: 2000, text: '{\\an8}<i>Italic</i> top\nsecond line' },
      { startMs: 5000, endMs: 6500, text: 'Later, with a comma' },
      { startMs: 7000, endMs: 8000, text: '<b>never closed</b>' },
    ]);
  });
  test('round trip (centisecond precision)', () => {
    const out = writeSubtitles(sample, 'ass');
    expect(out).toContain('Dialogue: 0,1:02:03.46,1:02:05.00,Default,,0,0,0,,{\\an8}Top & {\\b1}bold{\\b0}');
    expect(out).toContain('Two\\Nlines');
    const back = plain(parseAss(out));
    expect(back[0]).toEqual({ startMs: 1000, endMs: 2500, text: 'Hello <i>there</i>' });
    expect(back[2].startMs).toBe(3723460);
  });
});

describe('SBV / TXT / CSV', () => {
  test('SBV round trip strips tags', () => {
    const out = writeSubtitles(sample, 'sbv');
    expect(out.startsWith('0:00:01.000,0:00:02.500\nHello there\n')).toBe(true);
    expect(parseSbv(out)[1]).toMatchObject({ startMs: 3000, endMs: 4000, text: 'Two\nlines, with "quotes"' });
  });
  test('TXT import: paragraphs or lines, auto-timed in order', () => {
    const p = parseTxt('First para\nstill first\n\nSecond');
    expect(p.map(c => c.text)).toEqual(['First para\nstill first', 'Second']);
    expect(p[1].startMs).toBeGreaterThan(p[0].endMs);
    expect(parseTxt('a\nb\nc')).toHaveLength(3);
    expect(parseTxt('a\nb')[0]).toMatchObject({ startMs: 0, endMs: 1000 });
  });
  test('TXT export is one line per cue without tags', () => {
    expect(writeSubtitles(sample, 'txt')).toBe('Hello there\nTwo lines, with "quotes"\nTop & bold\n');
  });
  test('CSV quotes and BOM/CRLF options', () => {
    const out = writeSubtitles(sample, 'csv', { bom: true, eol: 'crlf' });
    expect(out.charCodeAt(0)).toBe(0xFEFF);
    expect(out).toContain('2,00:00:03,000,00:00:04,000,1.000,"Two\r\nlines, with ""quotes"""\r\n');
    expect(out.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
  test('SRT via parseSubtitles round trip', () => {
    const { format, cues } = parseSubtitles(writeSubtitles(sample, 'srt', { eol: 'crlf', bom: true }), 'x.srt');
    expect(format).toBe('srt');
    expect(plain(cues)).toEqual(plain(sample));
  });
});

describe('encoding', () => {
  test('BOMs and Windows-1252 fallback', () => {
    const utf8 = new TextEncoder().encode('﻿café');
    expect(decodeBytes(utf8.buffer)).toEqual({ text: 'café', encoding: 'UTF-8' });
    expect(decodeBytes(new Uint8Array([0x63, 0x61, 0x66, 0xE9]).buffer)).toEqual({ text: 'café', encoding: 'Windows-1252' });
    expect(decodeBytes(new Uint8Array([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00]).buffer)).toEqual({ text: 'hi', encoding: 'UTF-16 LE' });
  });
});
