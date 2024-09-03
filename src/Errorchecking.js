import React, { useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap';


function Errorchecking({Entries}) {
    const [buttonText, setButtonText] = useState('Check errors');
    const[errors,setErrors]=useState([])
    const[show,setShow]=useState(false)
   

    const checkSubtitleErrors = (e) => {
        setButtonText("Checking......")
      
        for (let i = 0; i < Entries.length - 1; i++) {
          const currentSubtitle = Entries[i];
          const nextSubtitle = Entries[i + 1];
      
          // Convert time strings to milliseconds for comparison
          const [currentStart, currentEnd] = [
            timeToMilliseconds(currentSubtitle.startTime),
            timeToMilliseconds(currentSubtitle.endTime),
            
          ];
         
          const [nextStart, nextEnd] = [
            timeToMilliseconds(nextSubtitle.startTime),
            timeToMilliseconds(nextSubtitle.endTime),
          ];
      
          // Check for incorrect time sequence
          if (currentEnd > nextStart) {
            
            errors.push({
              type: 'Overlap',
              message: `Overlap between subtitle ${i + 1} and subtitle ${i + 2}`,
              subtitles: [currentSubtitle, nextSubtitle],
            });
          }
      
          // Check for incorrect sequence (e.g., later subtitle appears before an earlier one)
          if (currentStart > nextStart) {
            errors.push({
              type: 'Incorrect Sequence',
              message: `Subtitle ${i + 2} starts before subtitle ${i + 1} ends`,
              subtitles: [currentSubtitle, nextSubtitle],
            });
          }
        }
      
        setButtonText("Check error")
        
        setShow(true)
      console.log(errors)
      };
      
      const timeToMilliseconds = (time) => {
        const [hours, minutes, seconds] = time.split(':');
        const [secs, ms] = seconds.split(',');
      
        return (
          parseInt(hours) * 3600000 +
          parseInt(minutes) * 60000 +
          parseInt(secs) * 1000 +
          parseInt(ms)
        );
      };
      
      // Example usage in a React component
      const handleCloseExportModal = () => {
        setShow(false);
        setErrors([])
      };

  return (
    <div>
<button onClick={checkSubtitleErrors} className='btn btn-primary' value={buttonText}>Check errors</button>
<Modal show={show} onHide={handleCloseExportModal}>
              <Modal.Header closeButton>
                <Modal.Title>{errors.length} Errors found</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <ul>
            {errors.map((error, index) => (
              <li key={index}>
                <strong>{error.type}:</strong> {error.message}
                <ul>
                  {error.subtitles.map((subtitle, idx) => (
                    <li key={idx}>
                      {subtitle.startTime} --> {subtitle.endTime}: {subtitle.text}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={handleCloseExportModal}>
                  Close
                </Button>
              
               
               
              </Modal.Footer>
            </Modal>
            

    </div>
  )
}

export default Errorchecking