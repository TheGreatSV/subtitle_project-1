// src/EditModal.js
import React, { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import {useEffect} from 'react';

function EditEntry({ Entries, show, handleClose, selectedIndex, handleSave }) {
    const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    if (selectedIndex !== null && Entries[selectedIndex]) {
      setSelectedEntry({ ...Entries[selectedIndex], index: selectedIndex });
    }
  }, [selectedIndex, Entries]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSelectedEntry({ ...selectedEntry, [name]: value });
  };

  const handleSaveClick = () => {
    if (selectedEntry) {
      handleSave(selectedEntry);
    }
  };


  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Edit Entry</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedEntry && (
          <form>
            <div className="form-group">
              <label>Start Time:</label>
              <input
                type="text"
                className="form-control"
                name="startTime"
                value={selectedEntry.startTime || ''}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>End Time:</label>
              <input
                type="text"
                className="form-control"
                name="endTime"
                value={selectedEntry.endTime || ''}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Text:</label>
              <input
                type="text"
                className="form-control"
                name="Text"
                value={selectedEntry.Text || ''}
                onChange={handleChange}
              />
            </div>
          </form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
        <Button variant="primary" onClick={handleSaveClick}>
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default EditEntry;
