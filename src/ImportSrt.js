import React,{useState} from 'react'
import srtParser2 from "srt-parser-2";
import { Modal, Button, Form } from 'react-bootstrap';


function ImportSrt({setEntries, SetDivs, setIndex}) {
    const [srtfile,setSrtFile]=useState('')

    
    const[show,setShow]=useState(false)

    const handleCloseExportModal = () => {
      setShow(false);
    };
  
    const ShowDialog=()=>
    {
        setShow(true)
    }
      
    const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setSrtFile(file);
      }
    };

    const handleSrtSelection=()=>
    {
      const SrtURL =srtfile
      console.log(SrtURL)
      setSrtFile(SrtURL)
      const reader = new FileReader();


      reader.onload = (e) => {
        const srtFileContent = e.target.result;
        var parser = new srtParser2();
        var srt_array = parser.fromSrt(srtFileContent);
      console.log(srt_array)
      
      const formattedArray = srt_array.map((entry, index) => {
        // Check if the necessary properties exist in the entry
        if (entry && entry.startTime && entry.endTime && entry.text) {
            return {
                id: (index + 1).toString(), // Assign a unique ID
                startTime: entry.startTime,
                endTime: entry.endTime,
                Text: entry.text, // Assuming the text is under the 'text' key in parsed SRT
            };
        } });

    console.log(formattedArray)
    setEntries(formattedArray);
     setIndex(+formattedArray.length+1)
     const divArray = Array.from({ length: +srt_array.length }, (_, index) => index + 1);
     SetDivs(divArray)
     console.log(divArray)
     handleCloseExportModal()
      }
      reader.readAsText(srtfile);
    }
 
  return (
    // <input 
    //     type="file" 
    //     accept="text/*" 
    //     onChange={handleSrtSelection} 
    //     style={{ marginBottom: '20px' }} 
    //   />
<div>
  <button onClick={ShowDialog}>Import SRT </button>
    <Modal show={show} onHide={handleCloseExportModal}>
      <Modal.Header closeButton>
        <Modal.Title>Import SRT File</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group controlId="formFileName">
            <Form.Label>File Name</Form.Label>
            <input
        type="file"
        accept=".srt" // Ensure that only .srt files can be selected
        onChange={handleFileChange}
        style={{ marginBottom: '20px' }}
      />

          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleCloseExportModal}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSrtSelection}>
          Import
        </Button>
      </Modal.Footer>
    </Modal>
    </div>
  )
}

export default ImportSrt