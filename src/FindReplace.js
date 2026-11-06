import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildMatcher, findMatches } from './lib/edit';

/**
 * Find & replace bar, docked at the top of the timeline.
 * Reports matching cue ids upward (for row highlighting) and asks the
 * workspace to jump / replace — the workspace owns cues and undo.
 */
function FindReplace({ open, focusSignal, cues, primaryIndex, onClose, onJump, onReplaceOne, onReplaceAll, onMatchIds }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [opts, setOpts] = useState({ caseSensitive: false, regex: false, wholeWord: false });
  const findRef = useRef(null);

  const { re, error } = useMemo(() => {
    try { return { re: buildMatcher(query, opts), error: '' }; } catch (e) { return { re: null, error: 'Invalid regular expression' }; }
  }, [query, opts]);

  const matches = useMemo(() => (open ? findMatches(cues, re) : []), [open, cues, re]);
  const total = matches.reduce((n, m) => n + m.count, 0);

  useEffect(() => { onMatchIds(new Set(matches.map(m => m.id))); }, [matches, onMatchIds]);
  useEffect(() => () => onMatchIds(new Set()), [onMatchIds]);

  useEffect(() => {
    if (open) { findRef.current?.focus(); findRef.current?.select(); }
  }, [open, focusSignal]);

  if (!open) return null;

  const currentPos = matches.findIndex(m => m.index === primaryIndex); // -1 when the selected cue isn't a match

  const jump = (dir) => {
    if (!matches.length) return;
    let target;
    if (dir > 0) target = matches.find(m => primaryIndex == null || m.index > primaryIndex) || matches[0];
    else target = [...matches].reverse().find(m => primaryIndex == null || m.index < primaryIndex) || matches[matches.length - 1];
    onJump(target.id);
  };

  const replaceCurrent = () => {
    if (!re) return;
    const cur = matches[currentPos];
    if (!cur) { jump(1); return; } // first press selects a match, second replaces it
    onReplaceOne(cur.id, re, replacement, opts.regex);
    const next = matches.find(m => m.index > cur.index) || matches.find(m => m.id !== cur.id);
    if (next) onJump(next.id);
  };

  const toggle = (k) => setOpts(o => ({ ...o, [k]: !o[k] }));

  return (
    <div className="ws-find" role="search" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="ws-find-row">
        <input
          ref={findRef}
          className={`ws-input${error ? ' invalid' : ''}`}
          placeholder="Find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jump(e.shiftKey ? -1 : 1); } }}
          aria-label="Find"
        />
        <span className="ws-find-count">
          {error || (query ? (total ? `${currentPos >= 0 ? `${currentPos + 1} of ` : ''}${matches.length} cue${matches.length === 1 ? '' : 's'} · ${total} match${total === 1 ? '' : 'es'}` : 'No matches') : '')}
        </span>
        <button className="ws-icon-btn" title="Previous (Shift+Enter)" onClick={() => jump(-1)} disabled={!matches.length}>↑</button>
        <button className="ws-icon-btn" title="Next (Enter)" onClick={() => jump(1)} disabled={!matches.length}>↓</button>
        <button className={`ws-chip${opts.caseSensitive ? ' on' : ''}`} title="Match case" onClick={() => toggle('caseSensitive')}>Aa</button>
        <button className={`ws-chip${opts.wholeWord ? ' on' : ''}`} title="Whole word" onClick={() => toggle('wholeWord')}>ab|</button>
        <button className={`ws-chip${opts.regex ? ' on' : ''}`} title="Regular expression" onClick={() => toggle('regex')}>.*</button>
        <button className="ws-icon-btn" title="Close (Esc)" onClick={onClose}>✕</button>
      </div>
      <div className="ws-find-row">
        <input
          className="ws-input"
          placeholder={opts.regex ? 'Replace ($1 for groups)' : 'Replace'}
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); } }}
          aria-label="Replace"
        />
        <button className="ws-btn" onClick={replaceCurrent} disabled={!matches.length}>Replace</button>
        <button className="ws-btn" onClick={() => onReplaceAll(re, replacement, opts.regex)} disabled={!matches.length}>Replace all</button>
      </div>
    </div>
  );
}

export default FindReplace;
