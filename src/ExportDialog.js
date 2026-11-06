import React, { useEffect, useMemo, useState } from 'react';
import WsModal from './Modal';
import { FORMATS, writeSubtitles, defaultExportOptions } from './lib/formats';

const ORDER = ['srt', 'vtt', 'ass', 'sbv', 'txt', 'csv'];

function readLast() {
  try { return JSON.parse(localStorage.getItem('srtc:pref:export')) || {}; } catch { return {}; }
}

/**
 * Export dialog: pick a format, file name, UTF-8 BOM and line endings.
 * Shows the first lines of the actual output so users see what they get.
 * The last format/options are remembered.
 */
function ExportDialog({ show, setShow, cues, defaultName = '', onExported }) {
  const [fileName, setFileName] = useState(defaultName);
  const [format, setFormat] = useState('srt');
  const [opts, setOpts] = useState(defaultExportOptions('srt'));

  useEffect(() => {
    if (!show) return;
    const last = readLast();
    const f = FORMATS[last.format] ? last.format : 'srt';
    setFormat(f);
    setOpts({ ...defaultExportOptions(f), ...(last.opts?.[f] || {}) });
    setFileName(defaultName);
  }, [show, defaultName]);

  const pickFormat = (f) => {
    setFormat(f);
    setOpts({ ...defaultExportOptions(f), ...(readLast().opts?.[f] || {}) });
  };

  const baseName = (fileName.trim() || 'subtitles').replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(srt|vtt|ass|ssa|sbv|txt|csv)$/i, '');
  const fullName = `${baseName}.${FORMATS[format].ext}`;

  const preview = useMemo(() => {
    if (!show) return '';
    const text = writeSubtitles(cues.slice(0, 3), format, { title: baseName });
    const lines = text.replace(/^﻿/, '').split('\n');
    return lines.slice(0, format === 'ass' ? 16 : 12).join('\n') + (cues.length > 3 || lines.length > 12 ? '\n…' : '');
  }, [show, cues, format, baseName]);

  const close = () => setShow(false);

  const doExport = () => {
    const content = writeSubtitles(cues, format, { ...opts, title: baseName });
    const blob = new Blob([content], { type: `${FORMATS[format].mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const last = readLast();
    try {
      localStorage.setItem('srtc:pref:export', JSON.stringify({ format, opts: { ...(last.opts || {}), [format]: opts } }));
    } catch { /* optional */ }
    onExported?.(fullName);
    close();
  };

  return (
    <WsModal show={show} onClose={close} title="Export subtitles" wide>
      <WsModal.Body>
        <div className="ws-form-group">
          <label>Format</label>
          <div className="ws-format-grid" role="radiogroup" aria-label="Format">
            {ORDER.map(f => (
              <button key={f} role="radio" aria-checked={format === f}
                      className={`ws-format${format === f ? ' on' : ''}`} onClick={() => pickFormat(f)}>
                <b>.{FORMATS[f].ext}</b>
                <span>{FORMATS[f].label.replace(/\s*\(.*\)$/, '')}</span>
              </button>
            ))}
          </div>
          <div className="ws-form-hint">{FORMATS[format].note}</div>
        </div>

        <div className="ws-form-row">
          <div className="ws-form-group">
            <label>File name</label>
            <input className="ws-input" placeholder="subtitles" value={fileName} autoFocus
                   onChange={(e) => setFileName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') doExport(); }} />
            <div className="ws-form-hint">Saved as {fullName}</div>
          </div>
          <div className="ws-form-group">
            <label>Options</label>
            <label className="ws-form-check">
              <input type="checkbox" checked={opts.bom} onChange={(e) => setOpts(o => ({ ...o, bom: e.target.checked }))} />
              UTF-8 BOM <span className="ws-form-hint" style={{ margin: 0 }}>(needed by Excel and some old players)</span>
            </label>
            <label className="ws-form-check">
              <input type="checkbox" checked={opts.eol === 'crlf'} onChange={(e) => setOpts(o => ({ ...o, eol: e.target.checked ? 'crlf' : 'lf' }))} />
              Windows line endings (CRLF)
            </label>
          </div>
        </div>

        <div className="ws-form-group">
          <label>Preview</label>
          <pre className="ws-export-preview">{preview || '(no cues)'}</pre>
        </div>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={close}>Cancel</button>
        <button className="ws-btn primary" onClick={doExport} disabled={!cues.length}>
          Export {cues.length} cue{cues.length === 1 ? '' : 's'} as .{FORMATS[format].ext}
        </button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default ExportDialog;
