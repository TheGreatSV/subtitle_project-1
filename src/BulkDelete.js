import React, { useState } from 'react';
import WsModal from './Modal';

function BulkDelete({ cues, setCues, onDeleted }) {
  const [startIndex, setStartIndex] = useState('');
  const [endIndex, setEndIndex] = useState('');
  const [show, setShow] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleClose = () => {
    setShow(false);
    setStartIndex('');
    setEndIndex('');
    setErrorMessage('');
  };

  const deleteRange = () => {
    const start = parseInt(startIndex, 10) - 1;
    const end = parseInt(endIndex, 10) - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || end >= cues.length) {
      setErrorMessage(`Enter a range between 1 and ${cues.length}, with start ≤ end.`);
      return;
    }

    const removed = cues.slice(start, end + 1).map(c => c.id);
    setCues(cues.filter((_, i) => i < start || i > end));
    onDeleted?.(removed);
    handleClose();
  };

  return (
    <>
      <button onClick={() => setShow(true)} className="ws-btn danger" disabled={cues.length === 0}>Bulk delete</button>

      <WsModal show={show} onClose={handleClose} title="Delete multiple cues" tone="danger">
        <WsModal.Body>
          <div className="ws-form-row">
            <div className="ws-form-group">
              <label>Start index (1-based)</label>
              <input type="number" min="1" max={cues.length} className="ws-input" placeholder="e.g. 3"
                     value={startIndex} onChange={(e) => setStartIndex(e.target.value)} />
            </div>
            <div className="ws-form-group">
              <label>End index (1-based)</label>
              <input type="number" min="1" max={cues.length} className="ws-input" placeholder="e.g. 8"
                     value={endIndex} onChange={(e) => setEndIndex(e.target.value)} />
            </div>
          </div>

          {errorMessage && <div className="ws-form-error">{errorMessage}</div>}

          <div className="ws-form-note">
            This permanently removes every cue from the start index through the end index, inclusive.
            <ul>
              <li>Indices are 1-based — cue #1 is the first row in the timeline.</li>
              <li>Set start and end to the same number to delete a single cue.</li>
            </ul>
          </div>
        </WsModal.Body>
        <WsModal.Footer>
          <button className="ws-btn" onClick={handleClose}>Cancel</button>
          <button className="ws-btn danger-solid" onClick={deleteRange}>Delete range</button>
        </WsModal.Footer>
      </WsModal>
    </>
  );
}

export default BulkDelete;
