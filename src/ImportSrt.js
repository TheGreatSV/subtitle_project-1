import React, { useEffect, useRef, useState } from 'react';
import WsModal from './Modal';
import { FORMATS, IMPORT_ACCEPT, parseSubtitles, readTextFile } from './lib/formats';
import { formatTime } from './lib/time';

/**
 * Import dialog for SRT, WebVTT, ASS/SSA, SBV and plain text.
 * Controlled by the workspace so a file dropped on the page can open it
 * pre-filled. Shows what was detected and a preview before anything changes.
 *
 * onImport(cues, { mode: 'replace' | 'append', fileName, format })
 */
function ImportSrt({ show, onClose, initialFile, hasCues, onImport }) {
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { format, cues, encoding }
  const [error, setError] = useState('');
  const [mode, setMode] = useState('replace');
  const inputRef = useRef(null);

  const reset = () => { setFile(null); setParsed(null); setError(''); setMode('replace'); };

  const load = async (f) => {
    setFile(f);
    setParsed(null);
    setError('');
    if (!f) return;
    try {
      const { text, encoding } = await readTextFile(f);
      const { format, cues } = parseSubtitles(text, f.name);
      if (!cues.length) {
        setError('No subtitles found in that file. Supported: SRT, VTT, ASS/SSA, SBV and plain text.');
        return;
      }
      setParsed({ format, cues, encoding });
    } catch (err) {
      setError(`Couldn't read that file: ${err.message}`);
    }
  };

  useEffect(() => {
    if (show && initialFile) load(initialFile);
    if (!show) reset();
    // load/reset only touch local state; re-running on their identity would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, initialFile]);

  const close = () => { reset(); onClose(); };

  const doImport = () => {
    if (!parsed) { setError('Choose a subtitle file first.'); return; }
    onImport(parsed.cues, { mode: hasCues ? mode : 'replace', fileName: file.name, format: parsed.format });
    close();
  };

  const preview = parsed ? parsed.cues.slice(0, 4) : [];

  return (
    <WsModal show={show} onClose={close} title="Import subtitles" wide>
      <WsModal.Body>
        <div className="ws-form-group">
          <label>Subtitle file</label>
          <div className="ws-file-drop" onClick={() => inputRef.current?.click()} role="button" tabIndex={0}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}>
            <input ref={inputRef} type="file" accept={IMPORT_ACCEPT}
                   onClick={(e) => e.stopPropagation()}
                   onChange={(e) => load(e.target.files?.[0] || null)} />
            {file ? <div className="picked">{file.name}</div> : <div className="ws-form-hint">SRT, VTT, ASS/SSA, SBV or TXT — or drop a file anywhere on the editor.</div>}
          </div>
        </div>

        {error && <div className="ws-form-error">{error}</div>}

        {parsed && (
          <>
            <div className="ws-import-summary">
              <span className="ws-tag">{FORMATS[parsed.format].label}</span>
              <span className="ws-tag">{parsed.encoding}</span>
              <span className="ws-tag">{parsed.cues.length} cue{parsed.cues.length === 1 ? '' : 's'}</span>
            </div>
            {parsed.format === 'txt' && (
              <div className="ws-form-note">
                Plain text has no timing, so each line (or paragraph) gets an estimated duration from reading speed.
                Re-time them against the video with <b>I</b>/<b>O</b> or <b>[</b>/<b>]</b>.
              </div>
            )}
            <div className="ws-import-preview">
              {preview.map((c) => (
                <div key={c.id} className="row">
                  <span className="tc">{formatTime(c.startMs)}</span>
                  <span className="txt">{c.text.replace(/\n/g, ' / ')}</span>
                </div>
              ))}
              {parsed.cues.length > preview.length && <div className="more">…and {parsed.cues.length - preview.length} more</div>}
            </div>

            {hasCues && (
              <div className="ws-form-group">
                <label>Your timeline already has cues</label>
                <div className="ws-segmented">
                  <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>Replace them</button>
                  <button className={mode === 'append' ? 'on' : ''} onClick={() => setMode('append')}>Add to them</button>
                </div>
                <div className="ws-form-hint">
                  {mode === 'replace' ? 'The current cues are removed — Undo (Ctrl+Z) brings them back.' : 'Imported cues are merged in and sorted by start time.'}
                </div>
              </div>
            )}
          </>
        )}
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={close}>Cancel</button>
        <button className="ws-btn primary" onClick={doImport} disabled={!parsed}>
          {parsed ? `Import ${parsed.cues.length} cue${parsed.cues.length === 1 ? '' : 's'}` : 'Import'}
        </button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default ImportSrt;
