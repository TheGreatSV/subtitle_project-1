import React from 'react';
import WsModal from './Modal';

export const SHORTCUTS = [
  ['Playback', [
    ['Space', 'Play / pause'],
    ['← / →', 'Seek 1s back / forward (Shift: 5s)'],
    ['Click a cue', 'Select it and jump the video to its start'],
  ]],
  ['Selection', [
    ['↑ / ↓', 'Previous / next cue (Shift: extend selection)'],
    ['Shift+Click', 'Select a range'],
    ['Ctrl+Click', 'Add / remove a cue from the selection'],
    ['Ctrl+A', 'Select all cues'],
    ['Home / End', 'First / last cue'],
    ['Esc', 'Clear selection'],
  ]],
  ['Timing', [
    ['I', 'Set start of selected cue to playhead'],
    ['O', 'Set end of selected cue to playhead'],
    ['[ / ]', 'Nudge selected cues 100ms earlier / later (Shift: 1s)'],
    ['N', 'New cue at playhead'],
  ]],
  ['Files & checks', [
    ['Ctrl+O', 'Import subtitles (SRT, VTT, ASS, SBV, TXT)'],
    ['Ctrl+Shift+E', 'Export (SRT, VTT, ASS, SBV, TXT, CSV)'],
    ['Drag & drop', 'Drop a subtitle file to import it, or a video to open it'],
    ['Q', 'Open / close the quality check'],
    ['Ctrl+S', 'Save now'],
  ]],
  ['Editing', [
    ['Enter', 'Edit text of selected cue'],
    ['Ctrl+Enter', 'Save text and leave the field'],
    ['Esc (in field)', 'Discard text changes'],
    ['M', 'Merge selected cues (or with next)'],
    ['S', 'Split at text cursor / playhead'],
    ['Del', 'Delete selected cues'],
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
    ['Ctrl+F', 'Find & replace'],
    ['?', 'This list'],
  ]],
];

function ShortcutsHelp({ show, onClose }) {
  return (
    <WsModal show={show} onClose={onClose} title="Keyboard shortcuts" wide>
      <WsModal.Body>
        <div className="ws-shortcuts">
          {SHORTCUTS.map(([group, rows]) => (
            <div key={group} className="ws-shortcuts-group">
              <h3>{group}</h3>
              <dl>
                {rows.map(([k, d]) => (
                  <React.Fragment key={k}>
                    <dt><kbd>{k}</kbd></dt>
                    <dd>{d}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn primary" onClick={onClose}>Close</button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default ShortcutsHelp;
