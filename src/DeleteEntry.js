import React from 'react';
import WsModal from './Modal';

function DeleteEntry({ handleClose, handleDelete, showDelete, count = 1 }) {
  const many = count > 1;
  return (
    <WsModal show={showDelete} onClose={handleClose} title={many ? `Delete ${count} cues` : 'Delete cue'} tone="danger">
      <WsModal.Body>
        <p>
          {many ? `Delete the ${count} selected cues?` : 'Delete this cue?'} You can bring {many ? 'them' : 'it'} back with Undo (Ctrl+Z).
        </p>
      </WsModal.Body>
      <WsModal.Footer>
        <button className="ws-btn" onClick={handleClose}>Cancel</button>
        <button className="ws-btn danger-solid" onClick={handleDelete} autoFocus>Delete</button>
      </WsModal.Footer>
    </WsModal>
  );
}

export default DeleteEntry;
