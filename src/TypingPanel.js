import React, { forwardRef } from 'react';
import { formatTime } from './lib/time';

/**
 * Typing mode panel (replaces the quick-add form while active).
 * Listen → start typing (the video pauses if you like) → Enter adds a timed cue
 * and playback carries on. All logic lives in the workspace; this is the view.
 */
const TypingPanel = forwardRef(function TypingPanel({
  text, onChange, onKeyDown, segStartMs, onStartHere, pauseOnType, onPauseOnType, onExit, isPlaying, videoLoaded, count,
}, ref) {
  return (
    <div className="ws-typing" role="region" aria-label="Typing mode">
      <div className="ws-typing-head">
        <span className="ws-typing-title">⌨ Typing mode</span>
        <span className="ws-typing-next">
          next cue from <b>{formatTime(segStartMs)}</b>
          <button className="ws-mini-btn" onClick={onStartHere} disabled={!videoLoaded} title="Start the next cue at the playhead">start here</button>
        </span>
        <span className="ws-spacer" />
        {count > 0 && <span className="ws-typing-count">{count} added</span>}
        <button className="ws-icon-btn" onClick={onExit} title="Leave typing mode (Ctrl+K)" aria-label="Leave typing mode">✕</button>
      </div>
      <textarea
        ref={ref}
        className="ws-input ws-typing-input"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={videoLoaded ? (isPlaying ? 'Type what you hear…' : 'Press Tab to play, then type what you hear…') : 'Open a video first'}
        disabled={!videoLoaded}
        rows={2}
        aria-label="Typed subtitle text"
        spellCheck
      />
      <div className="ws-typing-foot">
        <span className="keys">
          <b>Enter</b> add cue · <b>Shift+Enter</b> new line · <b>Tab</b> play/pause · <b>Shift+Tab</b> back 2s · <b>Esc</b> clear
        </span>
        <label className="ws-form-check">
          <input type="checkbox" checked={pauseOnType} onChange={(e) => onPauseOnType(e.target.checked)} />
          Pause while I type
        </label>
      </div>
    </div>
  );
});

export default TypingPanel;
