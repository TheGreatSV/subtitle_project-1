import React, { memo, useEffect, useRef, useState } from 'react';

/**
 * Draws the active subtitle(s) over the video preview.
 *
 * Why not the browser's own <track> rendering: browsers size track text as a
 * small fixed share of the video and ignore most page CSS, so in a 200–300px
 * preview it is tiny. Drawing it ourselves lets the text scale with the player,
 * honour a user size setting, and show <i>/<b>/<u> and {\an8} (top) properly.
 *
 * Timing: while playing it reads the media clock every animation frame, so a
 * subtitle appears on the right frame rather than up to 100ms late.
 */

/** "<i>Hi</i> there" → React nodes. Only i/b/u are honoured; everything else is plain text. */
function renderStyled(text) {
  const out = [];
  const style = { i: 0, b: 0, u: 0 };
  let key = 0;
  text.split(/(<\/?[ibuIBU]>)/).forEach(part => {
    const tag = part.match(/^<(\/?)([ibu])>$/i);
    if (tag) {
      const t = tag[2].toLowerCase();
      style[t] = Math.max(0, style[t] + (tag[1] ? -1 : 1));
      return;
    }
    if (!part) return;
    const clean = part.replace(/<[^>]*>/g, '');
    const s = {};
    if (style.i) s.fontStyle = 'italic';
    if (style.b) s.fontWeight = 700;
    if (style.u) s.textDecoration = 'underline';
    key += 1;
    out.push(Object.keys(s).length ? <span key={key} style={s}>{clean}</span> : <React.Fragment key={key}>{clean}</React.Fragment>);
  });
  return out;
}

function activeAt(cues, ms) {
  return cues.filter(c => ms >= c.startMs && ms < c.endMs);
}

function SubtitleOverlay({ cues, currentMs, isPlaying, getMediaMs, scale, hidden }) {
  const [now, setNow] = useState(currentMs);
  const lastKey = useRef('');
  const cuesRef = useRef(cues);
  cuesRef.current = cues;

  // Paused: follow the (seek-driven) currentMs.
  useEffect(() => { if (!isPlaying) setNow(currentMs); }, [currentMs, isPlaying]);

  // Playing: poll the media clock each frame, but only re-render when the set of visible cues changes.
  useEffect(() => {
    if (!isPlaying || !getMediaMs) return undefined;
    let raf = 0;
    const tick = () => {
      const t = getMediaMs();
      if (t != null) {
        const key = activeAt(cuesRef.current, t).map(c => c.id).join(',');
        if (key !== lastKey.current) { lastKey.current = key; setNow(t); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, getMediaMs]);

  if (hidden) return null;
  const active = activeAt(cues, now);
  if (!active.length) return null;

  const top = [];
  const bottom = [];
  active.forEach(c => {
    const m = c.text.match(/^\{\\an([1-9])\}/);
    const body = c.text.replace(/^\{\\an[1-9]\}/, '').trim();
    if (!body) return;
    (m && +m[1] >= 7 ? top : bottom).push({ id: c.id, body });
  });

  const block = (list) => list.map(({ id, body }) => (
    <div key={id} className="ws-sub-cue">
      {body.split('\n').map((line, i) => (
        <span key={i} className="ws-sub-line">{renderStyled(line)}</span>
      ))}
    </div>
  ));

  return (
    <div className="ws-sub-overlay" style={{ '--sub-scale': scale }} aria-live="off">
      {top.length > 0 && <div className="ws-sub-region top">{block(top)}</div>}
      {bottom.length > 0 && <div className="ws-sub-region bottom">{block(bottom)}</div>}
    </div>
  );
}

export default memo(SubtitleOverlay);
