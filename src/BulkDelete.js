import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

function BulkDelete({Entries, setEntries, Divs, setDivs}) {
    const [startIndex, setStartIndex] = useState('');
    const [endIndex, setEndIndex] = useState('');
    
   
    const[show,setShow]=useState(false)
    const handleClose = () => {
        setShow(false);
      };

      const showDialog = ()=>{
        setShow(true);
      }


      const deleteEntriesBulk = () => {
        
        const start = parseInt(startIndex)
        const end =parseInt(endIndex)
        let temp = [...Entries];
        let tempdiv=[...Divs];
        console.log(start)
        console.log(end)
        if ((start >= 0) && (end <= temp.length) && (start <= end)) {
            const updatedEntries = temp.filter((_, index) => index < startIndex || index > endIndex);
            const updatedDivs= tempdiv.filter((_, index) => index < startIndex || index > endIndex);
            setEntries(updatedEntries)
            setDivs(updatedDivs)
        } else {
          console.error("Invalid start or end index");
        }

        handleClose();
       
      };
  return (
    <div>
    <button onClick={showDialog} className='btn btn-danger'> Bulk Delete </button>


    <Modal show={show} onHide={handleClose}>
    <Modal.Header closeButton>
        <Modal.Title>Delete Multiple Entries</Modal.Title>
    </Modal.Header>
    <Modal.Body>
        <Form>
            <Form.Group>
                <Form.Label></Form.Label>
                <Row>
                    <Col>
                        <Form.Control
                            type="number"
                            placeholder="Start Index"
                            value={startIndex}
                            onChange={(e) => setStartIndex(e.target.value)}
                        />
                    </Col>
                    <Col>
                        <Form.Control
                            type="number"
                            placeholder="End Index"
                            value={endIndex}
                            onChange={(e) => setEndIndex(e.target.value)}
                        />
                    </Col>
                </Row>
            </Form.Group>

          
            <label style={{color:'red'}}>
            Note: Use this feature to delete entries starting from the start index mentioned.
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
        <Button variant="primary" onClick={deleteEntriesBulk}>
            Delete
        </Button>
    </Modal.Footer>
</Modal>
</div>
  )
}

export default BulkDelete