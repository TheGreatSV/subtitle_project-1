import React, { useEffect, useState } from 'react';
import WsModal from './Modal';

/**
 * Shift every cue's start/end by a signed millisecond offset.
 * Times clamp at 0; a cue's end never ends up before its start.
 * Returns { cues, clamped } where clamped counts cues that hit a limit.
 */
export function shiftCues(cues, startDeltaMs, endDeltaMs) {
  let clamped = 0;
  const next = cues.map((c) => {
    let startMs = c.startMs + startDeltaMs;
    let endMs = c.endMs + endDeltaMs;
    let hit = false;
    if (startMs < 0) { startMs = 0; hit = true; }
    if (endMs < startMs) { endMs = startMs; hit = true; }
    if (hit) clamped += 1;
    return { ...c, startMs: Math.round(startMs), endMs: Math.round(endMs) };
  });
  return { cues: next, clamped };
}

/** "1.5" → 1500, "-0.25" → -250, "" → 0, garbage → NaN */
export function parseOffsetSeconds(str) {
  const s = String(str).trim().replace(',', '.');
  if (s === '' || s === '-' || s === '+') return 0;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 1000);
}

/**
 * Controlled dialog: the workspace owns `show` so it can open it from the
 * toolbar or from the multi-selection panel. Scope is all cues, or only the
 * selected ones when there is a multi-selection.
 */
function ShiftTiming({ show, onClose, cues, selectedIds, fromIndex = null, defaultScope = 'all', onApply }) {
  const [startOffset, setStartOffset] = useState('0');
  const [endOffset, setEndOffset] = useState('0');
  const [linked, setLinked] = useState(true);
  const [scope, setScope] = useState(defaultScope);

  const selectedCount = selectedIds ? selectedIds.size : 0;

  // "From cue #N onward" — the usual fix when sync breaks after an ad break or a cut.
  const canFrom = fromIndex != null && fromIndex > 0 && fromIndex < cues.length;

  useEffect(() => {
    if (!show) return;
    if (defaultScope === 'selected' && selectedCount > 1) setScope('selected');
    else if (defaultScope === 'from' && canFrom) setScope('from');
    else setScope('all');
  }, [show, defaultScope, selectedCount, canFrom]);

  const startMs = parseOffsetSeconds(startOffset);
  const endMs = linked ? startMs : parseOffsetSeconds(endOffset);
  const invalid = Number.isNaN(startMs) || Number.isNaN(endMs);
  const noChange = !invalid && startMs === 0 && endMs === 0;
  const targetCount = scope === 'selected' ? selectedCount : scope === 'from' && canFrom ? cues.length - fromIndex : cues.length;

  const handleShift = () => {
    if (invalid || noChange) return;
    const ids = scope === 'selected' ? selectedIds
      : scope === 'from' && canFrom ? new Set(cues.slice(fromIndex).map(c => c.id))
      : null;
    const target = ids ? cues.filter(c => ids.has(c.id)) : cues;
    const { cues: shifted, clamped } = shiftCues(target, startMs, endMs);
    const byId = new Map(shifted.map(c => [c.id, c]));
    const next = cues.map(c => byId.get(c.id) || c);
    onApply(next, { count: shifted.length, clamped });
    setStartOffset('0');
    setEndOffset('0');
    onClose();
  };

  return (
    <WsModal show={show} onClose={onClose} title="Shift timing">
      <WsModal.Body>
        {(selectedCount > 1 || canFrom) && (
          <div className="ws-form-group">
            <label>Apply to</label>
            <div className="ws-segmented">
              <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All cues ({cues.length})</button>
              {selectedCount > 1 && (
                <button className={scope === 'selected' ? 'on' : ''} onClick={() => setScope('selected')}>Selected ({selectedCount})</button>
              )}
              {canFrom && (
                <button className={scope === 'from' ? 'on' : ''} onClick={() => setScope('from')}>From #{fromIndex + 1} onward ({cues.length - fromIndex})</button>
              )}
            </div>
          </div>
        )}

        <div className="ws-form-group">
          <label>{linked ? 'Offset (seconds)' : 'Start offset (seconds)'}</label>
          <input
            className="ws-input"
            inputMode="decimal"
            placeholder="e.g. 1.5 or -0.250"
            value={startOffset}
            onChange={(e) => setStartOffset(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleShift(); }}
            autoFocus
          />
        </div>

        {!linked && (
          <div className="ws-form-group">
            <label>End offset (seconds)</label>
            <input
              className="ws-input"
              inputMode="decimal"
              placeholder="e.g. 1.5 or -0.250"
              value={endOffset}
              onChange={(e) => setEndOffset(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleShift(); }}
            />
          </div>
        )}

        <label className="ws-form-check">
          <input type="checkbox" checked={!linked} onChange={(e) => setLinked(!e.target.checked)} />
          {' '}Shift start and end by different amounts
        </label>

        {invalid && <div className="ws-form-error">Enter a number of seconds, like 2, 0.5 or -1.250.</div>}

        <div className="ws-form-note">
          <ul>
            <li>Positive values push times later; negative values pull them earlier.</li>
            <li>Times stop at 00:00:00,000 — nothing goes negative.</li>
            <li>You can undo this with Ctrl+Z.</li>
          </ul>
        </div>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={onClose}>Cancel</button>
        <button className="ws-btn primary" onClick={handleShift} disabled={invalid || noChange}>
          Shift {targetCount} cue{targetCount === 1 ? '' : 's'}
        </button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default ShiftTiming;
