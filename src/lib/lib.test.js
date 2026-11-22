import { parseTime, formatTime, formatVttTime, maskTimeInput, isCompleteTime } from './time';
import { parseSrt, cuesToSrt, cuesToVtt, fromLegacyEntries, normalizeCues } from './cues';
import { shiftCues, parseOffsetSeconds } from '../ShiftTiming';
import { ensureMigrated, listProjects, loadCues, createProject, saveCues, deleteProject, writeRescue } from './storage';

describe('time', () => {
  test('parse/format round-trip', () => {
    expect(parseTime('01:02:03,456')).toBe(3723456);
    expect(formatTime(3723456)).toBe('01:02:03,456');
    expect(formatVttTime(3723456)).toBe('01:02:03.456');
  });
  test('short millisecond fields mean fractions', () => {
    expect(parseTime('00:00:01,5')).toBe(1500);
    expect(parseTime('00:00:01.05')).toBe(1050);
  });
  test('rejects invalid', () => {
    expect(parseTime('00:61:00,000')).toBeNaN();
    expect(parseTime('abc')).toBeNaN();
    expect(parseTime(undefined)).toBeNaN();
  });
  test('negative clamps to zero', () => {
    expect(formatTime(-500)).toBe('00:00:00,000');
  });
  test('input mask', () => {
    expect(maskTimeInput('000102500')).toBe('00:01:02,500');
    expect(maskTimeInput('0001')).toBe('00:01');
    expect(isCompleteTime('00:01:02,500')).toBe(true);
    expect(isCompleteTime('00:01:02')).toBe(false);
  });
});

describe('srt', () => {
  const sample = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nworld\r\n\r\n2\r\n00:00:03.000 --> 00:00:04,000 X1:10\r\nSecond\r\n\r\n\r\n';
  test('parses BOM, CRLF, "." separator and position info', () => {
    const cues = parseSrt(sample);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2500, text: 'Hello\nworld' });
    expect(cues[1]).toMatchObject({ startMs: 3000, endMs: 4000, text: 'Second' });
    expect(cues[0].id).not.toBe(cues[1].id);
  });
  test('handles missing blank line between cues', () => {
    const cues = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n');
    expect(cues.map(c => c.text)).toEqual(['A', 'B']);
  });
  test('round-trips through cuesToSrt', () => {
    const cues = parseSrt(sample);
    const again = parseSrt(cuesToSrt(cues));
    expect(again.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })))
      .toEqual(cues.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })));
  });
  test('vtt header and separators', () => {
    const vtt = cuesToVtt(parseSrt(sample));
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.500');
  });
  test('legacy entries convert; bad rows dropped', () => {
    const cues = fromLegacyEntries([
      { startTime: '00:00:01,000', endTime: '00:00:02,000', Text: 'Hi' },
      { startTime: 'bad', endTime: '00:00:02,000', Text: 'x' },
    ]);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2000, text: 'Hi' });
    expect(normalizeCues([{ startMs: 1, endMs: 2 }, null, { startMs: 'x' }])).toHaveLength(1);
  });
});

describe('shift timing', () => {
  const cues = [{ id: 'a', startMs: 200, endMs: 1000, text: '' }, { id: 'b', startMs: 2000, endMs: 3000, text: '' }];
  test('negative sub-second offsets work', () => {
    expect(parseOffsetSeconds('-0.5')).toBe(-500);
    expect(parseOffsetSeconds('1,25')).toBe(1250);
    expect(parseOffsetSeconds('')).toBe(0);
    expect(parseOffsetSeconds('abc')).toBeNaN();
    const { cues: out, clamped } = shiftCues(cues, -500, -500);
    expect(out[0]).toMatchObject({ startMs: 0, endMs: 500 });
    expect(out[1]).toMatchObject({ startMs: 1500, endMs: 2500 });
    expect(clamped).toBe(1);
  });
  test('end never before start', () => {
    const { cues: out } = shiftCues(cues, 0, -5000);
    expect(out[0].endMs).toBe(out[0].startMs);
  });
});

describe('storage (localStorage fallback in jsdom)', () => {
  beforeEach(() => localStorage.clear());

  test('migrates the old layout once and removes old keys', async () => {
    localStorage.setItem('Projects', JSON.stringify([{ name: 'ep1', created: '2025-01-01T00:00:00Z', modified: '2025-01-02T00:00:00Z' }]));
    localStorage.setItem('ep1Entries', JSON.stringify([{ startTime: '00:00:01,000', endTime: '00:00:02,000', Text: 'Hi' }]));
    localStorage.setItem('ep1Divs', JSON.stringify([1]));
    localStorage.setItem('ep1video', 'blob:dead');

    await ensureMigrated();
    const projects = await listProjects();
    expect(projects.map(p => p.name)).toEqual(['ep1']);
    const cues = await loadCues('ep1');
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2000, text: 'Hi' });
    expect(localStorage.getItem('Projects')).toBeNull();
    expect(localStorage.getItem('ep1Entries')).toBeNull();
    expect(localStorage.getItem('ep1video')).toBeNull();
  });

  test('create / save / delete', async () => {
    await createProject('p');
    await expect(createProject('p')).rejects.toThrow(/already exists/);
    await saveCues('p', [{ id: 'x', startMs: 1, endMs: 2, text: 't' }]);
    expect(await loadCues('p')).toHaveLength(1);
    await saveCues('p', []);
    expect(await loadCues('p')).toHaveLength(0);
    await deleteProject('p');
    expect((await listProjects()).some(x => x.name === 'p')).toBe(false);
  });

  test('rescue copy written on page close wins on next load, then is cleared', async () => {
    await createProject('r');
    await saveCues('r', [{ id: 'a', startMs: 1, endMs: 2, text: 'old' }]);
    writeRescue('r', [{ id: 'a', startMs: 1, endMs: 2, text: 'newer' }]);
    expect((await loadCues('r'))[0].text).toBe('newer');
    expect(localStorage.getItem('srtc:rescue:r')).toBeNull();
    expect((await loadCues('r'))[0].text).toBe('newer');
  });

  test('an older save finishing late does not discard a newer rescue copy', async () => {
    await createProject('s');
    writeRescue('s', [{ id: 'a', startMs: 1, endMs: 2, text: 'newest' }]);
    await saveCues('s', [{ id: 'a', startMs: 1, endMs: 2, text: 'older' }]);
    expect((await loadCues('s'))[0].text).toBe('newest');
  });

  test('corrupt rescue copy is ignored', async () => {
    await createProject('c');
    await saveCues('c', [{ id: 'a', startMs: 1, endMs: 2, text: 'kept' }]);
    localStorage.setItem('srtc:rescue:c', '{not json');
    expect((await loadCues('c'))[0].text).toBe('kept');
  });
});
