import React, { useMemo, useState } from 'react';
import WsModal from './Modal';
import { PRESETS, RULES, SETTING_FIELDS, summarize, isFixable } from './lib/qc';

const MAX_ROWS = 300;
const SEV_RANK = { error: 0, warning: 1, info: 2 };

/**
 * Quality check panel, docked in the timeline. Issues are recomputed live
 * as cues change, so fixing a cue makes its issue disappear immediately.
 * Clicking an issue selects that cue; "Fix" buttons apply automatic fixes
 * (each one undoable).
 */
function QualityPanel({ open, onClose, issues, settings, onSettings, primaryId, onJump, onFix }) {
  const [filter, setFilter] = useState(null); // rule key or null for all
  const [showAll, setShowAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const summary = useMemo(() => summarize(issues), [issues]);
  const visible = useMemo(() => {
    const list = filter ? issues.filter(i => i.rule === filter) : issues;
    return [...list].sort((a, b) => a.index - b.index || SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }, [issues, filter]);

  if (!open) return null;

  const activeFilter = filter && summary.byRule[filter] ? filter : null;
  const fixableInView = visible.filter(isFixable);
  const fixRules = new Set(fixableInView.map(i => i.rule));
  const presetLabel = PRESETS[settings.preset]?.label || 'Custom';

  return (
    <div className="ws-qc" role="region" aria-label="Quality check">
      <div className="ws-qc-head">
        <span className="ws-qc-title">Quality check</span>
        <span className="ws-qc-summary">
          {summary.total === 0 ? 'No issues' : (
            <>
              {summary.errors > 0 && <span className="sev error">{summary.errors} error{summary.errors === 1 ? '' : 's'}</span>}
              {summary.warnings > 0 && <span className="sev warning">{summary.warnings} warning{summary.warnings === 1 ? '' : 's'}</span>}
              {summary.total - summary.errors - summary.warnings > 0 && <span className="sev info">{summary.total - summary.errors - summary.warnings} tip{summary.total - summary.errors - summary.warnings === 1 ? '' : 's'}</span>}
            </>
          )}
        </span>
        <span className="ws-spacer" />
        <button className="ws-chip" onClick={() => setSettingsOpen(true)} title="Limits used by the check">{presetLabel.split(' (')[0]} ⚙</button>
        <button className="ws-btn" onClick={() => onFix({ rules: fixRules })} disabled={!fixableInView.length}
                title="Apply every automatic fix in this list (one Undo step)">
          Fix {activeFilter ? RULES[activeFilter].label.toLowerCase() : 'all'} ({fixableInView.length})
        </button>
        <button className="ws-icon-btn" onClick={onClose} title="Close (Q)" aria-label="Close quality check">✕</button>
      </div>

      {summary.total > 0 && (
        <div className="ws-qc-chips">
          <button className={`ws-chip${!activeFilter ? ' on' : ''}`} onClick={() => setFilter(null)}>All {summary.total}</button>
          {Object.keys(RULES).filter(r => summary.byRule[r]).map(r => (
            <button key={r} className={`ws-chip sev-${RULES[r].severity}${activeFilter === r ? ' on' : ''}`}
                    onClick={() => setFilter(activeFilter === r ? null : r)}>
              {RULES[r].label} {summary.byRule[r]}
            </button>
          ))}
        </div>
      )}

      <div className="ws-qc-list">
        {summary.total === 0 ? (
          <div className="ws-qc-empty">Everything passes the {presetLabel.toLowerCase()} checks.</div>
        ) : (
          <>
            {(showAll ? visible : visible.slice(0, MAX_ROWS)).map(issue => (
              <div
                key={issue.key}
                className={`ws-qc-item ${issue.severity}${issue.id === primaryId ? ' current' : ''}`}
                onClick={() => onJump(issue.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onJump(issue.id); }}
              >
                <span className="dot" aria-label={issue.severity} />
                <span className="idx">#{issue.index + 1}</span>
                <span className="rule">{RULES[issue.rule].label}</span>
                <span className="msg">{issue.message}</span>
                {issue.fix && (
                  <button className="ws-mini-btn" onClick={(e) => {
                    e.stopPropagation();
                    onFix({ rules: new Set([issue.rule]), ids: issue.rule === 'order' ? null : new Set([issue.id]) });
                  }}>{issue.fix}</button>
                )}
              </div>
            ))}
            {!showAll && visible.length > MAX_ROWS && (
              <button className="ws-linklike ws-qc-more" onClick={() => setShowAll(true)}>Show all {visible.length}</button>
            )}
          </>
        )}
      </div>

      <QcSettings show={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={onSettings} />
    </div>
  );
}

function QcSettings({ show, onClose, settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  React.useEffect(() => { if (show) setDraft(settings); }, [show, settings]);

  const pickPreset = (key) => setDraft(key === 'custom' ? { ...draft, preset: 'custom' } : { preset: key, ...PRESETS[key] });
  const setField = (k, v) => {
    const n = v === '' ? 0 : Math.max(0, Number(v));
    if (Number.isNaN(n)) return;
    setDraft(d => ({ ...d, [k]: n, preset: 'custom' }));
  };

  return (
    <WsModal show={show} onClose={onClose} title="Quality check limits">
      <WsModal.Body>
        <div className="ws-form-group">
          <label>Preset</label>
          <div className="ws-segmented">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} className={draft.preset === k ? 'on' : ''} onClick={() => pickPreset(k)}>{p.label.split(' (')[0]}</button>
            ))}
            <button className={draft.preset === 'custom' ? 'on' : ''} onClick={() => pickPreset('custom')}>Custom</button>
          </div>
          <div className="ws-form-hint">{PRESETS[draft.preset]?.label || 'Your own limits'}</div>
        </div>
        <div className="ws-qc-fields">
          {SETTING_FIELDS.map(([k, label, unit]) => (
            <label key={k} className="ws-qc-field">
              <span>{label}</span>
              <input className="ws-input" type="number" min="0" step={unit === 'ms' ? 50 : 1}
                     value={draft[k]} onChange={(e) => setField(k, e.target.value)} />
              <em>{unit}</em>
            </label>
          ))}
        </div>
        <div className="ws-form-note">Set any limit to 0 to switch that check off. The counters under the text field use the same limits.</div>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={onClose}>Cancel</button>
        <button className="ws-btn primary" onClick={() => { onSave(draft); onClose(); }}>Save limits</button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default QualityPanel;
