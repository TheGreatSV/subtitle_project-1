import './WaveformTimeline.css';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import {
  tickStep, tickLabel, clampZoom, clampView, zoomAround, snapTime, snapTargets, hitTest, resizeCue, moveCues,
  SNAP_PX,
} from './lib/timeline';
import { visibleText } from './lib/qc';

const RULER_H = 20;
const MIN_CREATE_MS = 200;
const DEFAULT_PPS = 80;

const C = {
  bg: '#0b0e12',
  ruler: '#12161b',
  rulerText: '#6b7684',
  tick: '#262e38',
  grid: 'rgba(38,46,56,0.55)',
  wave: '#35507a',
  waveSel: '#6f9df0',
  cueFill: 'rgba(77,141,255,0.10)',
  cueStroke: 'rgba(77,141,255,0.45)',
  selFill: 'rgba(77,141,255,0.22)',
  selStroke: '#4d8dff',
  primStroke: '#9cc0ff',
  label: '#b7c0cb',
  labelSel: '#eaf1ff',
  error: '#ef5350',
  warning: '#f0b429',
  playhead: '#f0b429',
  ghost: 'rgba(240,180,41,0.18)',
  snap: '#eaf1ff',
};

function readPref(key, fallback) {
  try { const v = localStorage.getItem(`srtc:pref:${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(`srtc:pref:${key}`, JSON.stringify(value)); } catch { /* optional */ }
}

const fmtSpan = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

/**
 * Waveform timeline: audio waveform with the cues drawn as draggable blocks.
 *
 *  - click ruler / empty space → seek          - drag empty space → new cue
 *  - drag a cue edge → re-time                 - drag a cue → move it (or the whole selection)
 *  - edges snap to other cues and the playhead (hold Alt to turn snapping off)
 *  - wheel scrolls, Ctrl/⌘+wheel zooms around the pointer
 *
 * Each drag is one undo step: onEdit(next, label, sessionKey) is called with the
 * same session key for every move of the same drag.
 */
const WaveformTimeline = forwardRef(function WaveformTimeline({
  cues, selIds, primaryId, issueLevels, currentMs, getMediaMs, durationMs, isPlaying, follow,
  peaks, status, collapsed, onToggle, onRetry,
  onSeek, onSelect, onEdit, onCreate, onActivate,
}, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [pps, setPps] = useState(() => clampZoom(readPref('zoom', DEFAULT_PPS)));
  const [viewStart, setViewStart] = useState(0);
  const [ghost, setGhost] = useState(null);   // { startMs, endMs } while drag-creating
  const [snapLine, setSnapLine] = useState(null);
  const drag = useRef(null);
  const sessionSeq = useRef(0);
  const L = useRef({});

  const visibleMs = (width / pps) * 1000;
  L.current = { cues, selIds, primaryId, pps, viewStart, visibleMs, durationMs, currentMs, width };

  // ---------------------------------------------------------------- size
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(100, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  // ---------------------------------------------------------------- view helpers
  const setView = useCallback((ms) => {
    const { visibleMs: vis, durationMs: dur } = L.current;
    setViewStart(clampView(ms, vis, dur));
  }, []);

  const zoomTo = useCallback((next, anchorMs) => {
    const { pps: old, viewStart: vs, visibleMs: vis, durationMs: dur, width: w, currentMs: now } = L.current;
    const z = clampZoom(next);
    const anchor = anchorMs ?? (now >= vs && now <= vs + vis ? now : vs + vis / 2);
    setPps(z);
    setViewStart(clampView(zoomAround(vs, old, z, anchor), (w / z) * 1000, dur));
    writePref('zoom', z);
  }, []);

  const fit = useCallback(() => {
    const { width: w, durationMs: dur } = L.current;
    const z = clampZoom(w / Math.max(1, dur / 1000));
    setPps(z);
    setViewStart(0);
    writePref('zoom', z);
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomTo(L.current.pps * 1.5),
    zoomOut: () => zoomTo(L.current.pps / 1.5),
    fit,
  }), [zoomTo, fit]);

  // Keep the view inside the timeline when the duration or zoom changes.
  useEffect(() => { setViewStart(v => clampView(v, visibleMs, durationMs)); }, [visibleMs, durationMs]);

  // Keep the playhead in view: page forward while playing (if following), recentre after a seek.
  useEffect(() => {
    if (drag.current) return;
    const { viewStart: vs, visibleMs: vis } = L.current;
    const inView = currentMs >= vs && currentMs <= vs + vis;
    if (isPlaying) {
      if (follow && (currentMs > vs + vis * 0.92 || currentMs < vs)) setView(currentMs - vis * 0.08);
    } else if (!inView) {
      setView(currentMs - vis * 0.3);
    }
  }, [currentMs, isPlaying, follow, setView]);

  // Bring a newly selected cue into view.
  useEffect(() => {
    if (!primaryId || drag.current) return;
    const c = L.current.cues.find(x => x.id === primaryId);
    if (!c) return;
    const { viewStart: vs, visibleMs: vis } = L.current;
    if (c.startMs < vs || c.endMs > vs + vis) setView(c.startMs - vis * 0.2);
  }, [primaryId, setView]);

  // ---------------------------------------------------------------- drawing
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = width;
    const h = canvas.clientHeight || 110;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = (ms) => ((ms - viewStart) / 1000) * pps;
    const now = isPlaying && getMediaMs ? (getMediaMs() ?? currentMs) : currentMs;

    // background + ruler
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, w, RULER_H);

    const step = tickStep(pps);
    const first = Math.floor(viewStart / step) * step;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    for (let t = first; t <= viewStart + visibleMs + step; t += step) {
      const px = Math.round(x(t)) + 0.5;
      ctx.fillStyle = C.grid;
      ctx.fillRect(px, RULER_H, 1, h - RULER_H);
      ctx.fillStyle = C.tick;
      ctx.fillRect(px, RULER_H - 6, 1, 6);
      ctx.fillStyle = C.rulerText;
      ctx.fillText(tickLabel(t, step), px + 4, RULER_H / 2);
      // minor ticks
      const minor = step / 5;
      for (let k = 1; k < 5; k += 1) {
        const mx = Math.round(x(t + k * minor)) + 0.5;
        ctx.fillStyle = C.tick;
        ctx.fillRect(mx, RULER_H - 3, 1, 3);
      }
    }

    // past the end of the media
    if (durationMs < viewStart + visibleMs) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(Math.max(0, x(durationMs)), RULER_H, w, h - RULER_H);
    }

    const top = RULER_H + 1;
    const mid = top + (h - top) / 2;
    const amp = (h - top) / 2 - 3;

    // selected-cue spans (waveform is brighter inside them)
    const selSpans = cues.filter(c => selIds.has(c.id) || c.id === primaryId).map(c => [c.startMs, c.endMs]);
    const inSel = (ms) => selSpans.some(([a, b]) => ms >= a && ms <= b);

    // waveform
    if (peaks?.data) {
      const { data, perSec } = peaks;
      const n = data.length / 2;
      const bucketsPerPx = perSec / pps;
      for (let px = 0; px < w; px += 1) {
        const t0 = viewStart + (px / pps) * 1000;
        const b0 = Math.floor((t0 / 1000) * perSec);
        const b1 = Math.max(b0 + 1, Math.floor(b0 + bucketsPerPx));
        if (b0 >= n) break;
        if (b1 <= 0) continue;
        let lo = 0;
        let hi = 0;
        for (let b = Math.max(0, b0); b < Math.min(n, b1); b += 1) {
          if (data[b * 2] < lo) lo = data[b * 2];
          if (data[b * 2 + 1] > hi) hi = data[b * 2 + 1];
        }
        const y0 = mid - hi * amp;
        const y1 = mid - lo * amp;
        ctx.fillStyle = inSel(t0) ? C.waveSel : C.wave;
        ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
      }
    } else {
      ctx.fillStyle = C.tick;
      ctx.fillRect(0, Math.round(mid), w, 1);
    }

    // cues: unselected first, selected on top
    const vis = cues
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.endMs >= viewStart && c.startMs <= viewStart + visibleMs);
    vis.sort((a, b) => (selIds.has(a.c.id) || a.c.id === primaryId ? 1 : 0) - (selIds.has(b.c.id) || b.c.id === primaryId ? 1 : 0));
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'top';
    for (const { c, i } of vis) {
      const sel = selIds.has(c.id) || c.id === primaryId;
      const x0 = x(c.startMs);
      const x1 = x(c.endMs);
      const bw = Math.max(1, x1 - x0);
      const y = top + 4;
      const bh = h - top - 8;
      ctx.fillStyle = sel ? C.selFill : C.cueFill;
      ctx.fillRect(x0, y, bw, bh);
      ctx.strokeStyle = c.id === primaryId ? C.primStroke : sel ? C.selStroke : C.cueStroke;
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.strokeRect(Math.round(x0) + 0.5, y + 0.5, Math.max(1, Math.round(bw) - 1), bh - 1);
      // edge grips
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(x0, y, 2, bh);
      ctx.fillRect(x1 - 2, y, 2, bh);
      // issue marker
      const lvl = issueLevels?.get(c.id);
      if (lvl === 'error' || lvl === 'warning') {
        ctx.fillStyle = lvl === 'error' ? C.error : C.warning;
        ctx.fillRect(x0, y, Math.max(2, bw), 2);
      }
      // label
      if (bw > 24) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 4, y, bw - 8, bh);
        ctx.clip();
        ctx.fillStyle = sel ? C.labelSel : C.label;
        ctx.globalAlpha = sel ? 1 : 0.85;
        const label = visibleText(c.text).replace(/\n/g, ' / ') || '(empty)';
        ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = sel ? C.labelSel : C.rulerText;
        ctx.fillText(String(i + 1), x0 + 6, y + 5);
        ctx.font = '11px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        ctx.fillStyle = sel ? C.labelSel : C.label;
        ctx.fillText(label, x0 + 6, y + 18);
        ctx.restore();
      }
    }

    // drag-create ghost
    if (ghost) {
      const gx0 = x(ghost.startMs);
      const gx1 = x(ghost.endMs);
      ctx.fillStyle = C.ghost;
      ctx.fillRect(gx0, top + 4, gx1 - gx0, h - top - 8);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C.playhead;
      ctx.strokeRect(Math.round(gx0) + 0.5, top + 4.5, Math.round(gx1 - gx0), h - top - 9);
      ctx.setLineDash([]);
    }

    // snap indicator
    if (snapLine != null) {
      ctx.fillStyle = C.snap;
      ctx.fillRect(Math.round(x(snapLine)), RULER_H, 1, h - RULER_H);
    }

    // playhead
    const phx = Math.round(x(now)) + 0.5;
    if (phx >= -6 && phx <= w + 6) {
      ctx.fillStyle = C.playhead;
      ctx.fillRect(phx - 0.5, 0, 1.5, h);
      ctx.beginPath();
      ctx.moveTo(phx - 5, 0);
      ctx.lineTo(phx + 5, 0);
      ctx.lineTo(phx, 7);
      ctx.closePath();
      ctx.fill();
    }
  }, [width, pps, viewStart, visibleMs, durationMs, cues, selIds, primaryId, issueLevels, peaks, ghost, snapLine, currentMs, isPlaying, getMediaMs]);

  // Redraw on changes; while playing, redraw every frame so the playhead glides.
  useEffect(() => {
    if (collapsed) return undefined;
    let raf = 0;
    const loop = () => { draw(); if (isPlaying) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, isPlaying, collapsed]);

  // ---------------------------------------------------------------- pointer
  const timeAt = (clientX) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const { viewStart: vs, pps: z } = L.current;
    return vs + ((clientX - rect.left) / z) * 1000;
  };

  const setCursor = (c) => { if (canvasRef.current) canvasRef.current.style.cursor = c; };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const ms = timeAt(e.clientX);
    const y = e.clientY - rect.top;
    const base = { startX: e.clientX, downMs: ms, moved: false, mods: { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey } };

    if (y < RULER_H) {
      drag.current = { ...base, mode: 'scrub' };
      onSeek(Math.max(0, ms));
      return;
    }
    const hit = hitTest(cues, ms, pps, { priority: primaryId, selected: selIds });
    sessionSeq.current += 1;
    const session = `drag:${sessionSeq.current}`;
    if (hit && hit.kind !== 'body') {
      drag.current = { ...base, mode: 'resize', edge: hit.kind, id: hit.id, original: cues, session };
      if (!selIds.has(hit.id) && hit.id !== primaryId) onSelect(hit.id, {});
    } else if (hit) {
      const group = selIds.has(hit.id) && selIds.size > 1 ? new Set(selIds) : new Set([hit.id]);
      drag.current = { ...base, mode: 'move', id: hit.id, ids: group, original: cues, session };
    } else {
      drag.current = { ...base, mode: 'create' };
    }
  };

  const handlePointerMove = (e) => {
    const d = drag.current;
    const ms = timeAt(e.clientX);
    if (!d) {
      const rect = canvasRef.current.getBoundingClientRect();
      if (e.clientY - rect.top < RULER_H) { setCursor('col-resize'); return; }
      const hit = hitTest(cues, ms, pps, { priority: primaryId, selected: selIds });
      setCursor(!hit ? 'crosshair' : hit.kind === 'body' ? 'grab' : 'ew-resize');
      return;
    }
    if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
    d.moved = true;

    // Auto-scroll when dragging near the edges.
    const rect = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const edgeZone = 28;
    if (d.mode !== 'scrub' && (px < edgeZone || px > rect.width - edgeZone)) {
      const dir = px < edgeZone ? -1 : 1;
      setView(L.current.viewStart + dir * (L.current.visibleMs * 0.04));
    }

    const snapOn = !e.altKey;
    const thr = (SNAP_PX * 1000) / pps;

    if (d.mode === 'scrub') { onSeek(Math.max(0, ms)); return; }

    if (d.mode === 'resize') {
      const targets = snapOn ? snapTargets(d.original, new Set([d.id]), [L.current.currentMs]) : [];
      const s = snapTime(ms, targets, thr);
      setSnapLine(s.snapped ? s.ms : null);
      onEdit(resizeCue(d.original, d.id, d.edge, s.ms), 'Re-time cue', d.session);
      setCursor('ew-resize');
      return;
    }

    if (d.mode === 'move') {
      const grabbed = d.original.find(c => c.id === d.id);
      let delta = ms - d.downMs;
      if (snapOn && grabbed) {
        const targets = snapTargets(d.original, d.ids, [L.current.currentMs]);
        const a = snapTime(grabbed.startMs + delta, targets, thr);
        const b = snapTime(grabbed.endMs + delta, targets, thr);
        const da = a.snapped ? Math.abs(a.ms - (grabbed.startMs + delta)) : Infinity;
        const db = b.snapped ? Math.abs(b.ms - (grabbed.endMs + delta)) : Infinity;
        if (da <= db && a.snapped) { delta = a.ms - grabbed.startMs; setSnapLine(a.ms); }
        else if (b.snapped) { delta = b.ms - grabbed.endMs; setSnapLine(b.ms); }
        else setSnapLine(null);
      }
      onEdit(moveCues(d.original, d.ids, delta), d.ids.size > 1 ? `Move ${d.ids.size} cues` : 'Move cue', d.session);
      setCursor('grabbing');
      return;
    }

    if (d.mode === 'create') {
      const targets = snapOn ? snapTargets(cues, new Set(), [L.current.currentMs]) : [];
      const s = snapTime(Math.max(0, ms), targets, thr);
      const a = Math.max(0, d.downMs);
      setSnapLine(s.snapped ? s.ms : null);
      setGhost({ startMs: Math.min(a, s.ms), endMs: Math.max(a, s.ms) });
    }
  };

  const finish = (e, cancelled = false) => {
    const d = drag.current;
    drag.current = null;
    setSnapLine(null);
    if (!d) return;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);

    if (cancelled) { setGhost(null); return; }

    if (!d.moved) {
      if (d.mode === 'move' || d.mode === 'resize') {
        onSelect(d.id, d.mods);
        if (!d.mods.ctrl && !d.mods.shift) onSeek(Math.max(0, timeAt(e.clientX)));
      } else if (d.mode === 'create') {
        onSeek(Math.max(0, timeAt(e.clientX)));
      }
      return;
    }

    if (d.mode === 'create') {
      const g = ghost;
      setGhost(null);
      if (g && g.endMs - g.startMs >= MIN_CREATE_MS) onCreate(Math.round(g.startMs), Math.round(g.endMs));
      return;
    }

    if (d.mode === 'move') {
      // Keep the list in time order after a move (same undo step as the move).
      const cur = L.current.cues;
      const sorted = cur.map((c, i) => [c, i]).sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map(([c]) => c);
      if (sorted.some((c, i) => c !== cur[i])) onEdit(sorted, d.ids.size > 1 ? `Move ${d.ids.size} cues` : 'Move cue', d.session);
      if (!selIds.has(d.id)) onSelect(d.id, {});
    }
  };

  const handleDoubleClick = (e) => {
    const hit = hitTest(cues, timeAt(e.clientX), pps, { priority: primaryId, selected: selIds });
    if (hit) onActivate(hit.id);
  };

  // Wheel must be non-passive to stop the page scrolling.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { pps: z, viewStart: vs } = L.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const anchor = vs + ((e.clientX - rect.left) / z) * 1000;
        zoomTo(z * Math.exp(-e.deltaY * 0.0015), anchor);
      } else {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        setView(vs + (delta / z) * 1000);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, setView, collapsed]);

  // ---------------------------------------------------------------- render
  const maxStart = Math.max(0, durationMs - visibleMs);
  const st = status || { state: 'idle' };

  return (
    <div className={`ws-wave${collapsed ? ' collapsed' : ''}`}>
      <div className="ws-wave-head">
        <button className="ws-wave-toggle" onClick={onToggle} title="Show / hide the waveform (W)" aria-expanded={!collapsed}>
          <span className="chev">{collapsed ? '▸' : '▾'}</span> Waveform
        </button>
        <span className={`ws-wave-status ${st.state}`}>
          {st.state === 'loading' && (
            <>
              <span className="ws-wave-spinner" aria-hidden="true" />
              {st.text || 'Reading audio…'}{st.progress != null ? ` ${Math.round(st.progress * 100)}%` : ''}
            </>
          )}
          {st.state === 'error' && (
            <>
              Couldn't read the audio{st.text ? ` — ${st.text}` : ''}.
              <button className="ws-linklike" onClick={onRetry}>Try again</button>
            </>
          )}
          {st.state === 'novideo' && 'Open a video to see its waveform — you can still drag cues here.'}
        </span>
        <span className="ws-spacer" />
        {!collapsed && (
          <>
            <span className="ws-wave-hint">Drag edges to re-time · drag empty space to add a cue · Alt = no snap</span>
            <div className="ws-wave-zoom" role="group" aria-label="Zoom">
              <button className="ws-icon-btn" onClick={() => zoomTo(pps / 1.5)} title="Zoom out (−)" aria-label="Zoom out">−</button>
              <span className="span" title="Visible time span">{fmtSpan(visibleMs)}</span>
              <button className="ws-icon-btn" onClick={() => zoomTo(pps * 1.5)} title="Zoom in (+)" aria-label="Zoom in">+</button>
              <button className="ws-chip" onClick={fit} title="Fit the whole video">Fit</button>
            </div>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="ws-wave-canvas" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => finish(e)}
              onPointerCancel={(e) => finish(e, true)}
              onDoubleClick={handleDoubleClick}
              onLostPointerCapture={(e) => { if (drag.current) finish(e); }}
              aria-label="Waveform timeline"
              role="application"
            />
          </div>
          <input
            className="ws-wave-scroll"
            type="range"
            min={0}
            max={Math.max(1, Math.round(maxStart))}
            step={Math.max(1, Math.round(visibleMs / 50))}
            value={Math.round(Math.min(viewStart, maxStart))}
            onChange={(e) => setView(Number(e.target.value))}
            disabled={maxStart <= 0}
            aria-label="Scroll timeline"
          />
        </>
      )}
    </div>
  );
});

export default WaveformTimeline;
