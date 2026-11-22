import React, { useEffect, useMemo, useState } from 'react';
import WsModal from './Modal';
import { formatTime, parseTime, maskTimeInput, isCompleteTime } from './lib/time';
import { visibleText } from './lib/qc';
import {
  FPS_PRESETS, HI_OPTIONS, convertFrameRate, twoPointSync, removeHearingImpaired, changeCase,
  removeFormatting, autoLineBreak, joinLines, fixPunctuation, diffCues,
} from './lib/tools';

const TOOLS = [
  { group: 'Sync', key: 'fps', label: 'Frame rate', hint: 'Fix subtitles that drift further and further out of sync' },
  { group: 'Sync', key: 'twopoint', label: 'Two-point sync', hint: 'Line up a cue near the start and one near the end' },
  { group: 'Text', key: 'hi', label: 'Remove hearing-impaired', hint: '[music], (laughs), JOHN:, ♪' },
  { group: 'Text', key: 'case', label: 'Change case', hint: 'UPPER, lower or Sentence case' },
  { group: 'Text', key: 'lines', label: 'Line breaks', hint: 'Auto-balance or join lines' },
  { group: 'Text', key: 'punct', label: 'Fix punctuation', hint: 'Spaces, dots, dialogue dashes' },
  { group: 'Text', key: 'format', label: 'Remove formatting', hint: 'Strip <i>, <b>, colours…' },
];

const MAX_PREVIEW = 6;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fpsLabel = (f) => (Number.isInteger(f) ? String(f) : f.toFixed(3).replace(/0+$/, ''));
const snippet = (t) => { const v = visibleText(t || '').replace(/\n/g, ' / '); return v.length > 70 ? `${v.slice(0, 67)}…` : v || '(empty)'; };

function TimeField({ value, onChange, onPlayhead, canPlayhead, label }) {
  return (
    <div className="ws-tools-time">
      <input className={`ws-input${value && !isCompleteTime(value) ? ' invalid' : ''}`} inputMode="numeric"
             placeholder="00:00:00,000" value={value} aria-label={label}
             onChange={(e) => onChange(maskTimeInput(e.target.value))} />
      <button className="ws-mini-btn" onClick={onPlayhead} disabled={!canPlayhead} title="Use the video's current position">= playhead</button>
    </div>
  );
}

/**
 * Tools dialog: batch sync and text clean-up. Every tool previews exactly what
 * will change and applies as a single undo step.
 */
function Tools({ show, onClose, cues, selectedIds, primaryIndex, currentMs, videoLoaded, limits, onApply }) {
  const [tool, setTool] = useState('fps');
  const [scope, setScope] = useState('all');
  const [fps, setFps] = useState({ from: 25, to: 23.976 });
  const [hi, setHi] = useState({ brackets: true, parens: true, speakers: true, music: true });
  const [caseMode, setCaseMode] = useState('sentence');
  const [lineMode, setLineMode] = useState('balance');
  const [keepPos, setKeepPos] = useState(true);
  const [pts, setPts] = useState({ aIdx: 1, aTo: '', bIdx: 1, bTo: '' });

  const multi = selectedIds && selectedIds.size > 1;

  // Fresh defaults each time the dialog opens.
  useEffect(() => {
    if (!show) return;
    setScope(multi ? 'selected' : 'all');
    const idxs = cues.map((c, i) => i).filter(i => !multi || selectedIds.has(cues[i].id));
    const first = idxs.length ? idxs[0] : 0;
    const last = idxs.length ? idxs[idxs.length - 1] : 0;
    setPts({
      aIdx: first + 1, aTo: cues[first] ? formatTime(cues[first].startMs) : '',
      bIdx: last + 1, bTo: cues[last] ? formatTime(cues[last].startMs) : '',
    });
    // only when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const ids = scope === 'selected' && multi ? selectedIds : null;
  const scopeCount = ids ? ids.size : cues.length;

  const result = useMemo(() => {
    if (!show) return { cues, note: '' };
    switch (tool) {
      case 'fps':
        return { cues: convertFrameRate(cues, fps.from, fps.to, ids), label: `Frame rate ${fpsLabel(fps.from)} → ${fpsLabel(fps.to)}`,
          note: fps.from === fps.to ? 'Pick two different frame rates.' : `Every time is multiplied by ${(fps.from / fps.to).toFixed(5)}.` };
      case 'twopoint': {
        const a = cues[pts.aIdx - 1];
        const b = cues[pts.bIdx - 1];
        if (!a || !b) return { cues, note: `Choose cue numbers between 1 and ${cues.length}.` };
        if (a === b) return { cues, note: 'Pick two different cues — ideally one near the start and one near the end.' };
        if (!isCompleteTime(pts.aTo) || !isCompleteTime(pts.bTo)) return { cues, note: 'Enter both correct times, like 00:01:02,500.' };
        const r = twoPointSync(cues, { fromMs: a.startMs, toMs: parseTime(pts.aTo) }, { fromMs: b.startMs, toMs: parseTime(pts.bTo) }, ids);
        if (!r) return { cues, note: 'Those two points would reverse the timeline — check the times.' };
        const off = r.offsetMs / 1000;
        return { cues: r.cues, label: 'Two-point sync',
          note: `Speed ×${r.scale.toFixed(5)}, offset ${off >= 0 ? '+' : ''}${off.toFixed(3)} s.` };
      }
      case 'hi':
        return { cues: removeHearingImpaired(cues, hi, ids), label: 'Remove hearing-impaired text',
          note: Object.values(hi).some(Boolean) ? 'Cues left with no text are deleted.' : 'Tick at least one kind of text to remove.' };
      case 'case':
        return { cues: changeCase(cues, caseMode, ids), label: `Change case (${caseMode})`,
          note: caseMode === 'sentence' ? 'Names will be lower-cased too — check them in the preview.' : '' };
      case 'lines':
        return lineMode === 'balance'
          ? { cues: autoLineBreak(cues, limits, ids), label: 'Auto line-break', note: `Up to ${limits.maxLines} lines of ${limits.maxLineLength} characters (your quality-check limits).` }
          : { cues: joinLines(cues, ids), label: 'Join lines', note: 'Each cue becomes a single line.' };
      case 'punct':
        return { cues: fixPunctuation(cues, ids), label: 'Fix punctuation', note: '' };
      case 'format':
        return { cues: removeFormatting(cues, { keepPosition: keepPos }, ids), label: 'Remove formatting', note: '' };
      default:
        return { cues, note: '' };
    }
  }, [show, tool, cues, ids, fps, pts, hi, caseMode, lineMode, keepPos, limits]);

  const changes = useMemo(() => (show ? diffCues(cues, result.cues) : []), [show, cues, result.cues]);
  const removed = changes.filter(c => !c.after).length;
  const isTiming = tool === 'fps' || tool === 'twopoint';

  const apply = () => {
    if (!changes.length) return;
    onApply(result.cues, result.label, { changed: changes.length - removed, removed });
    onClose();
  };

  const setPoint = (k, v) => setPts(p => ({ ...p, [k]: v }));
  const playhead = formatTime(currentMs);
  const cueStart = (n) => (cues[n - 1] ? formatTime(cues[n - 1].startMs) : '—');

  return (
    <WsModal show={show} onClose={onClose} title="Tools" wide>
      <WsModal.Body>
        <div className="ws-tools">
          <nav className="ws-tools-nav" aria-label="Tools">
            {['Sync', 'Text'].map(g => (
              <div key={g} className="ws-tools-group">
                <div className="ws-tools-group-title">{g}</div>
                {TOOLS.filter(t => t.group === g).map(t => (
                  <button key={t.key} className={`ws-tools-item${tool === t.key ? ' on' : ''}`} onClick={() => setTool(t.key)}>
                    <b>{t.label}</b>
                    <span>{t.hint}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="ws-tools-main">
            {multi && (
              <div className="ws-form-group">
                <div className="ws-segmented">
                  <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All cues ({cues.length})</button>
                  <button className={scope === 'selected' ? 'on' : ''} onClick={() => setScope('selected')}>Selected ({selectedIds.size})</button>
                </div>
              </div>
            )}

            {tool === 'fps' && (
              <div className="ws-form-row">
                <div className="ws-form-group">
                  <label>Subtitles were timed for</label>
                  <select className="ws-input" value={fps.from} onChange={(e) => setFps(f => ({ ...f, from: Number(e.target.value) }))}>
                    {FPS_PRESETS.map(f => <option key={f} value={f}>{fpsLabel(f)} fps</option>)}
                  </select>
                </div>
                <div className="ws-form-group">
                  <label>Your video plays at</label>
                  <select className="ws-input" value={fps.to} onChange={(e) => setFps(f => ({ ...f, to: Number(e.target.value) }))}>
                    {FPS_PRESETS.map(f => <option key={f} value={f}>{fpsLabel(f)} fps</option>)}
                  </select>
                </div>
              </div>
            )}

            {tool === 'twopoint' && (
              <>
                <div className="ws-form-note" style={{ marginTop: 0 }}>
                  Find a cue near the start and one near the end, play the video to where each line is actually spoken,
                  and set those times. Everything in between is stretched to match.
                </div>
                {[['a', 'First point'], ['b', 'Second point']].map(([k, title]) => (
                  <div key={k} className="ws-tools-point">
                    <div className="ws-tools-point-title">{title}</div>
                    <div className="ws-tools-point-row">
                      <label>
                        <span>Cue #</span>
                        <input className="ws-input" type="number" min="1" max={cues.length} value={pts[`${k}Idx`]}
                               onChange={(e) => setPoint(`${k}Idx`, Math.max(1, Math.min(cues.length, Number(e.target.value) || 1)))} />
                      </label>
                      <div className="ws-tools-now">now {cueStart(pts[`${k}Idx`])}<em>{snippet(cues[pts[`${k}Idx`] - 1]?.text)}</em></div>
                      <label className="grow">
                        <span>Should start at</span>
                        <TimeField label={`${title} correct time`} value={pts[`${k}To`]} onChange={(v) => setPoint(`${k}To`, v)}
                                   onPlayhead={() => setPoint(`${k}To`, playhead)} canPlayhead={videoLoaded} />
                      </label>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tool === 'hi' && (
              <div className="ws-tools-checks">
                {Object.entries(HI_OPTIONS).map(([k, o]) => (
                  <label key={k} className="ws-form-check">
                    <input type="checkbox" checked={hi[k]} onChange={(e) => setHi(h => ({ ...h, [k]: e.target.checked }))} />
                    {o.label} <code>{o.example}</code>
                  </label>
                ))}
              </div>
            )}

            {tool === 'case' && (
              <div className="ws-segmented">
                {[['sentence', 'Sentence case'], ['upper', 'UPPER CASE'], ['lower', 'lower case']].map(([k, l]) => (
                  <button key={k} className={caseMode === k ? 'on' : ''} onClick={() => setCaseMode(k)}>{l}</button>
                ))}
              </div>
            )}

            {tool === 'lines' && (
              <div className="ws-segmented">
                <button className={lineMode === 'balance' ? 'on' : ''} onClick={() => setLineMode('balance')}>Auto-balance lines</button>
                <button className={lineMode === 'join' ? 'on' : ''} onClick={() => setLineMode('join')}>Join into one line</button>
              </div>
            )}

            {tool === 'punct' && (
              <ul className="ws-tools-list">
                <li>Removes spaces before <code>, . ! ? ; :</code> and adds a missing space after <code>, ! ? ;</code></li>
                <li>Adds a space between sentences that run together: <code>Yes.No</code> → <code>Yes. No</code></li>
                <li>Turns runs of dots into <code>...</code> and <code>-Hi</code> dialogue dashes into <code>- Hi</code></li>
                <li>Collapses double spaces. Numbers like <code>3.50</code> and times like <code>10:30</code> are left alone.</li>
              </ul>
            )}

            {tool === 'format' && (
              <label className="ws-form-check">
                <input type="checkbox" checked={keepPos} onChange={(e) => setKeepPos(e.target.checked)} />
                Keep top-of-screen position (<code>{'{\\an8}'}</code>)
              </label>
            )}

            {result.note && <div className="ws-form-hint ws-tools-note">{result.note}</div>}

            <div className="ws-tools-preview">
              <div className="ws-tools-preview-head">
                Preview — {changes.length
                  ? `${plural(changes.length - removed, 'cue')} change${removed ? `, ${plural(removed, 'cue')} removed` : ''}`
                  : `no changes${scopeCount ? '' : ' (no cues)'}`}
              </div>
              {changes.slice(0, MAX_PREVIEW).map(ch => (
                <div key={ch.before.id} className={`ws-tools-change${ch.after ? '' : ' removed'}`}>
                  <span className="n">#{ch.index + 1}</span>
                  {isTiming ? (
                    <span className="d timing">
                      <s>{formatTime(ch.before.startMs)}</s><span aria-hidden="true">→</span><b>{formatTime(ch.after.startMs)}</b>
                    </span>
                  ) : (
                    <span className="d">
                      <s>{snippet(ch.before.text)}</s>
                      <b>{ch.after ? snippet(ch.after.text) : 'removed'}</b>
                    </span>
                  )}
                </div>
              ))}
              {changes.length > MAX_PREVIEW && <div className="ws-tools-more">…and {changes.length - MAX_PREVIEW} more</div>}
            </div>
          </div>
        </div>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={onClose}>Cancel</button>
        <button className="ws-btn primary" onClick={apply} disabled={!changes.length}>
          {changes.length ? `Apply to ${plural(changes.length, 'cue')}` : 'Nothing to change'}
        </button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default Tools;
