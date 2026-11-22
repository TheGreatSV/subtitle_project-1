/**
 * waveform.js — turn a video/audio file into waveform peaks for the timeline.
 *
 * Peaks are min/max pairs per time bucket (PEAKS_PER_SEC buckets per second),
 * stored as one Float32Array: [min0, max0, min1, max1, ...].
 *
 * Two decoders:
 *  1. Web Audio (fast, built in) for files the browser can decode, up to
 *     WEB_AUDIO_MAX_BYTES (it needs the whole file in memory).
 *  2. ffmpeg.wasm fallback for everything else (MKV, AC-3/E-AC-3, huge files).
 *     The file is mounted read-only (WORKERFS), not copied, and ffmpeg outputs
 *     8 kHz mono float PCM, so memory stays small even for long videos.
 *
 * Results are cached per project in IndexedDB, keyed by file name/size/date.
 */
import { kvGet, kvSet } from './storage';

export const PEAKS_PER_SEC = 100;
const DECODE_RATE = 8000; // plenty for a waveform; keeps memory low
const WEB_AUDIO_MAX_BYTES = 300 * 1024 * 1024;

// ffmpeg core (ESM build — the @ffmpeg/ffmpeg worker runs as a module).
// Override with REACT_APP_FFMPEG_CORE_BASE to self-host the two core files.
const CORE_VERSION = '0.12.6';
const CORE_BASES = [
  process.env.REACT_APP_FFMPEG_CORE_BASE,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
].filter(Boolean);

/** Signature that changes when the user picks a different file. */
export const fileSignature = (file) => `${file.name}|${file.size}|${file.lastModified || 0}`;

/**
 * Mono min/max peaks from one or more channels of PCM.
 * channels: Float32Array[] (same length), sampleRate: Hz.
 */
export function computePeaks(channels, sampleRate, perSec = PEAKS_PER_SEC) {
  const len = channels[0]?.length || 0;
  const bucket = sampleRate / perSec;
  const n = Math.ceil(len / bucket);
  const out = new Float32Array(n * 2);
  const nch = channels.length;
  for (let b = 0; b < n; b += 1) {
    const from = Math.floor(b * bucket);
    const to = Math.min(len, Math.floor((b + 1) * bucket));
    let min = 0;
    let max = 0;
    for (let i = from; i < to; i += 1) {
      let v = 0;
      for (let c = 0; c < nch; c += 1) v += channels[c][i];
      v /= nch;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

/** Scale so the loudest peak reaches ~95% height (quiet videos still show detail). */
export function normalizePeaks(peaks) {
  let m = 0;
  for (let i = 0; i < peaks.length; i += 1) { const a = Math.abs(peaks[i]); if (a > m) m = a; }
  if (m < 1e-4) return peaks;
  const k = 0.95 / m;
  const out = new Float32Array(peaks.length);
  for (let i = 0; i < peaks.length; i += 1) out[i] = peaks[i] * k;
  return out;
}

async function decodeWithWebAudio(file) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('Web Audio not available');
  const buf = await file.arrayBuffer();
  // decodeAudioData resamples to the context's rate — 8 kHz keeps memory ~8× lower than 48 kHz.
  const ctx = new Ctx(1, 1, DECODE_RATE);
  const audio = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(buf, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
  const channels = [];
  for (let c = 0; c < audio.numberOfChannels; c += 1) channels.push(audio.getChannelData(c));
  return { peaks: computePeaks(channels, audio.sampleRate), durationMs: Math.round(audio.duration * 1000) };
}

let ffmpegPromise = null;

async function loadFfmpeg(onStage) {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    onStage?.('Loading audio decoder (one-time, ~30 MB)…');
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    let lastErr;
    for (const base of CORE_BASES) {
      const ff = new FFmpeg();
      try {
        await ff.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        return ff;
      } catch (err) {
        lastErr = err;
        try { ff.terminate(); } catch { /* ignore */ }
      }
    }
    throw lastErr || new Error('Could not load the audio decoder');
  })();
  ffmpegPromise.catch(() => { ffmpegPromise = null; });
  return ffmpegPromise;
}

async function decodeWithFfmpeg(file, { onProgress, onStage }) {
  const ff = await loadFfmpeg(onStage);
  onStage?.('Reading audio…');
  const onProg = ({ progress }) => { if (progress >= 0 && progress <= 1) onProgress?.(progress); };
  const logTail = [];
  const onLog = ({ message }) => { logTail.push(message); if (logTail.length > 40) logTail.shift(); };
  ff.on('progress', onProg);
  ff.on('log', onLog);
  const dir = `/in${Date.now()}`;
  try {
    await ff.createDir(dir);
    await ff.mount('WORKERFS', { files: [file] }, dir);
    const code = await ff.exec(['-hide_banner', '-i', `${dir}/${file.name}`, '-vn', '-ac', '1', '-ar', String(DECODE_RATE), '-f', 'f32le', '/peaks.pcm']);
    if (code !== 0) {
      console.error('[waveform] ffmpeg failed:\n' + logTail.join('\n'));
      throw new Error('This file has no audio track ffmpeg can read');
    }
    const data = await ff.readFile('/peaks.pcm');
    await ff.deleteFile('/peaks.pcm').catch(() => {});
    const pcm = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 4));
    return { peaks: computePeaks([pcm], DECODE_RATE), durationMs: Math.round((pcm.length / DECODE_RATE) * 1000) };
  } finally {
    ff.off('progress', onProg);
    ff.off('log', onLog);
    await ff.unmount(dir).catch(() => {});
    await ff.deleteDir(dir).catch(() => {});
  }
}

/**
 * Build (or load cached) peaks for a project's video.
 * Returns { peaks: Float32Array, perSec, durationMs, method }.
 */
export async function getPeaks(project, file, { onProgress, onStage } = {}) {
  const sig = fileSignature(file);
  const key = `peaks:${project}`;
  try {
    const cached = await kvGet(key);
    if (cached && cached.sig === sig && cached.data) {
      return { peaks: cached.data, perSec: cached.perSec, durationMs: cached.durationMs, method: 'cache' };
    }
  } catch { /* cache is optional */ }

  let result = null;
  let method = 'webaudio';
  let forceFfmpeg = false;
  try { forceFfmpeg = localStorage.getItem('srtc:debug:forceFfmpeg') === '1'; } catch { /* ignore */ }

  if (!forceFfmpeg && file.size <= WEB_AUDIO_MAX_BYTES) {
    onStage?.('Reading audio…');
    try { result = await decodeWithWebAudio(file); } catch { result = null; }
  }
  if (!result) {
    method = 'ffmpeg';
    result = await decodeWithFfmpeg(file, { onProgress, onStage });
  }

  const peaks = normalizePeaks(result.peaks);
  try {
    await kvSet(key, { sig, perSec: PEAKS_PER_SEC, durationMs: result.durationMs, data: peaks });
  } catch { /* quota — just don't cache */ }
  return { peaks, perSec: PEAKS_PER_SEC, durationMs: result.durationMs, method };
}
