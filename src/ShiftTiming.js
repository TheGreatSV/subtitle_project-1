import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';


function ShiftTiming({Entries, setEntries, formatDuration}) {
    const [startSeconds, setStartSeconds] = useState(0);
    const [startMilliseconds, setStartMilliseconds] = useState(0);
    const [endSeconds, setEndSeconds] = useState(0);
    const [endMilliseconds, setEndMilliseconds] = useState(0);
    const[show,setShow]=useState(false)

    const handleClose = () => {
        setShow(false);
      };

      const showDialog = ()=>{
        setShow(true);
      }

      function convertToSeconds(timeStr) {
        // Split the time string into hours, minutes, seconds, and milliseconds
        const [time, ms] = timeStr.split(',');  // Split by the comma
        const [hours, minutes, seconds] = time.split(':');  // Split by the colon
    
        // Convert to seconds
        const totalSeconds = 
            (parseInt(hours, 10) * 3600) +   // Convert hours to seconds
            (parseInt(minutes, 10) * 60) +   // Convert minutes to seconds
            parseFloat(seconds) +            // Add seconds
            (parseInt(ms, 10) / 1000);       // Add the fractional part from milliseconds
    
        return totalSeconds;
    }
      

    const handleShift = () => {
        let updatedEntries = Entries.map((entry) => {
            // Convert current start and end times to seconds
            let currentStart = convertToSeconds(entry.startTime);
            let currentEnd = convertToSeconds(entry.endTime);
    
            // Calculate the shift time in seconds (including milliseconds as fractional seconds)
            let totalSecondsStart = +startSeconds + (startMilliseconds / 1000);
            let totalSecondsEnd = +endSeconds + (endMilliseconds / 1000);
    
            // Adjust start time based on whether the shift is negative or positive
            if (startSeconds < 0) {
                totalSecondsStart = currentStart - Math.abs(totalSecondsStart);
            } else {
                totalSecondsStart = currentStart + totalSecondsStart;
            }
    
            // Adjust end time based on whether the shift is negative or positive
            if (endSeconds < 0) {
                totalSecondsEnd = currentEnd - Math.abs(totalSecondsEnd);
            } else {
                totalSecondsEnd = currentEnd + totalSecondsEnd;
            }
    
            // Return updated entry with formatted time
            return {
                ...entry,
                startTime: formatDuration(totalSecondsStart), // Convert back to hh:mm:ss,sss
                endTime: formatDuration(totalSecondsEnd)      // Convert back to hh:mm:ss,sss
            };
        });
    
        // Set the updated entries
        setEntries(updatedEntries);
        handleClose()
    };
    

    

  return (
    <div><button className='btn btn-danger' onClick={showDialog}>ShiftTiming</button>
    

    <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Shift Timings of all entries</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>Start Time</Form.Label>
                        <Row>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Seconds"
                                    value={startSeconds}
                                    onChange={(e) => setStartSeconds(e.target.value)}
                                />
                            </Col>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Milliseconds"
                                    value={startMilliseconds}
                                    onChange={(e) => setStartMilliseconds(e.target.value)}
                                />
                            </Col>
                        </Row>
                    </Form.Group>

                    <Form.Group className="mt-3">
                        <Form.Label>End Time</Form.Label>
                        <Row>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Seconds"
                                    value={endSeconds}
                                    onChange={(e) => setEndSeconds(e.target.value)}
                                />
                            </Col>
                            <Col>
                                <Form.Control
                                    type="number"
                                    placeholder="Milliseconds"
                                    value={endMilliseconds}
                                    onChange={(e) => setEndMilliseconds(e.target.value)}
                                />
                            </Col>
                        </Row>
                    </Form.Group>
                    <label style={{color:'red'}}>
                    Note: Use this feature to adjust the start and end times of all entries.
            <li>
                Enter a positive value to add time or a negative value to subtract time.
                </li>  <li>Set the value to 0 if no changes are required.</li> 
                 
                    </label>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleClose}>
                    Close
                </Button>
                <Button variant="primary" onClick={handleShift}>
                    Shift
                </Button>
            </Modal.Footer>
        </Modal>
    
    </div>
  )
}

export default ShiftTiming