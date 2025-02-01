import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

function BulkDelete({ Entries, setEntries, Divs, setDivs }) {
    const [startIndex, setStartIndex] = useState('');
    const [endIndex, setEndIndex] = useState('');
    const [show, setShow] = useState(false);
    const [errorMessage, setErrorMessage] = useState(''); // State for error message

    const handleClose = () => {
        setShow(false);
        setStartIndex(''); // Reset input fields
        setEndIndex('');
        setErrorMessage(''); // Reset error message
    };

    const showDialog = () => {
        setShow(true);
    };

    const deleteEntriesBulk = () => {
        // Convert user input from 1-based to 0-based indexing
        const start = parseInt(startIndex) - 1; // Convert to 0-based
        const end = parseInt(endIndex) - 1; // Convert to 0-based

        // Validate the indices
        if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || start > end || end >= Entries.length) {
            setErrorMessage("Invalid start or end index. Please ensure the indices are valid.");
            return; // Early return on invalid input
        }

        // Filter out the entries and divs based on the calculated indices
        const updatedEntries = Entries.filter((_, index) => index < start || index > end);
        const updatedDivs = Divs.filter((_, index) => index < start || index > end);
        
        setEntries(updatedEntries);
        setDivs(updatedDivs);
        handleClose();
    };

    return (
        <div>
            <button onClick={showDialog} className='btn btn-danger'>Bulk Delete</button>

            <Modal show={show} onHide={handleClose}>
                <Modal.Header closeButton>
                    <Modal.Title>Delete Multiple Entries</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group>
                            <Row>
                                <Col>
                                    <Form.Control
                                        type="number"
                                        placeholder="Start Index (1-based)"
                                        value={startIndex}
                                        onChange={(e) => setStartIndex(e.target.value)}
                                    />
                                </Col>
                                <Col>
                                    <Form.Control
                                        type="number"
                                        placeholder="End Index (1-based)"
                                        value={endIndex}
                                        onChange={(e) => setEndIndex(e.target.value)}
                                    />
                                </Col>
                            </Row>
                        </Form.Group>
                        {errorMessage && (
                            <div style={{ color: 'red', marginTop: '10px' }}>
                                {errorMessage}
                            </div>
                        )}
                        <label style={{ color: 'red' }}>
                            Note: Use this feature to delete entries starting from the start index mentioned.
                            <ul>
                                <li>Enter a positive value to add time or a negative value to subtract time.</li>
                                <li>Set the value to 0 if no changes are required.</li>
                            </ul>
                        </label>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={deleteEntriesBulk}>
                        Delete
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default BulkDelete;