// ExportModal.js
import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

function ExportHardwiring({ show, saveSrtFile, convertToSrt, Entries, setShow }) {
  const [fileName, setFileName] = useState('');

  const handleFileNameChange = (e) => {
    setFileName(e.target.value);
  };

  const handleCloseExportModal = () => {
    setShow(false);
  };


  return (
    <Modal show={show} onHide={handleCloseExportModal}>
      <Modal.Header closeButton>
        <Modal.Title>Export SRT File</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group controlId="formFileName">
            <Form.Label>File Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter file name"
              value={fileName}
              onChange={handleFileNameChange}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleCloseExportModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={()=>saveSrtFile(Entries, fileName)}>
          Export
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ExportHardwiring;
