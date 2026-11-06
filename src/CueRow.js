import React, { memo } from 'react';
import { formatTime } from './lib/time';
import { visibleText } from './lib/qc';

/**
 * One timeline row. Memoized: during playback the playhead updates ~10×/s,
 * and only the rows whose flags actually change re-render.
 * All handlers must be stable (useCallback) for memo to help.
 */
function CueRow({
  cue, index, isLast,
  selected, primary, issue, playing, match,
  onRowMouseDown, onRowClick, onMerge, onDelete, rowRef,
}) {
  const pos = cue.text.match(/^\{\\an([1-9])\}/);
  const top = pos && +pos[1] >= 7;
  const styled = /<\/?[ibu]>/i.test(cue.text);
  const shown = visibleText(cue.text);
  const lines = shown.split('\n');
  const cls = [
    'ws-row',
    primary ? 'active' : selected ? 'selected' : '',
    issue === 'error' ? 'error' : issue === 'warning' ? 'warn' : issue === 'info' ? 'tip' : '',
    playing ? 'playing' : '',
    match ? 'match' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={(el) => rowRef(cue.id, el)}
      className={cls}
      onMouseDown={(e) => onRowMouseDown(e)}
      onClick={(e) => onRowClick(cue.id, e)}
      tabIndex={-1}
      role="option"
      aria-selected={selected}
      data-id={cue.id}
    >
      <span className="idx">{index + 1}</span>
      <span className="tc">{formatTime(cue.startMs)}</span>
      <span className="tc">{formatTime(cue.endMs)}</span>
      <span className={`txt${styled ? ' styled' : ''}`} title={cue.text}>
        {top && <span className="ws-pos-tag" title="Shown at the top of the screen">top</span>}
        {shown.trim() === '' ? <span className="txt-empty">(empty)</span> : lines.map((l, i) => (
          <React.Fragment key={i}>{i > 0 && <span className="nl"> / </span>}{l}</React.Fragment>
        ))}
      </span>
      <span className="row-actions">
        <button className="ws-icon-btn" title="Merge with next (M)" disabled={isLast}
                onClick={(e) => { e.stopPropagation(); onMerge(index); }}>⤓</button>
        <button className="ws-icon-btn danger" title="Delete (Del)"
                onClick={(e) => { e.stopPropagation(); onDelete(cue.id); }}>✕</button>
      </span>
    </div>
  );
}

export default memo(CueRow);
