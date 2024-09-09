import React from 'react'
import { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import LoadingSpinner from './LoadingSpinner';
import './VideoProcessor.css';

function SeverProcessing({Entries, VideoFile}) {


    const [ffmpeg, setFfmpeg] = useState(null);
    const [outputFile, setOutputFile] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [videoFile, setVideoFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [show,setShow] =useState(false)
    const[progress,setProgress]=useState(0)

   
    const ShowDialog=()=>{
        if(VideoFile != null){
            setVideoFile(VideoFile)
            console.log({VideoFile})
        }else{
            console.log("null")
        }
        setShow(true)
    }

    // Initialize FFmpeg
   



    // Convert entries to SRT format
    const convertToSrt = (Entries) => {
        return Entries
            .map((entry, index) => {
                const { startTime, endTime, Text } = entry;
                return `${index + 1}\n${startTime} --> ${endTime}\n${Text}\n`;
            })
            .join('\n');
    };

    // Handle video file selection
    const handleVideoFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setVideoFile(file);
        }
    };


    const handleProcessVideo = () => {
      return new Promise((resolve, reject) => {
          const subtitleString = convertToSrt(Entries);
          const subtitleBlob = new Blob([subtitleString], { type: 'text/plain' });
          const subtitleFile = new File([subtitleBlob], 'subtitles.srt', { type: 'text/plain' });
          
          const formData = new FormData();
          formData.append('videoFile', videoFile);
          formData.append('subtitleFile', subtitleFile);
          
          const xhr = new XMLHttpRequest();
          
          // Update progress event
          xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                  const percentComplete = Math.round((event.loaded / event.total) * 100);
                  console.log(`Upload Progress: ${percentComplete}%`);
                  // Update progress bar or UI element here
                  setProgress(percentComplete);
              }
          };
          
          // Handle successful response
          xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                  const blob = new Blob([xhr.response], { type: 'video/mp4' });
                  const url = URL.createObjectURL(blob);
                  
                  // Create a temporary <a> element to trigger download
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'processed-video.mp4'; // Name the downloaded file
                  document.body.appendChild(a); // Append to the DOM
                  a.click(); // Programmatically click to trigger the download
                  a.remove(); // Remove the element after triggering the download
                  setProgress(0)
                  // Optionally revoke the object URL after the download
                  URL.revokeObjectURL(url);
                  
                  resolve('Upload and processing complete.');
              } else {
                  reject(`HTTP error ${xhr.status}`);
              }
          };
          
          // Handle errors
          xhr.onerror = () => {
              reject('Network error');
          };
          
          // Open and send the request
          
          xhr.open('POST', '/process-video', true);
          xhr.responseType = 'blob'; // Ensure the response is treated as a Blob
          xhr.send(formData);
      });
  };
  
  // Example usage
 
  
        // const response = await fetch('http://51.195.118.81:5000/process-video', {
        //   method: 'POST',
        //   body: formData,
        // });
      
      //   // Check if the response is successful
      //   if (response.ok) {
      //     const blob = await response.blob();
      //     const url = URL.createObjectURL(blob);
          
      //     // Create a temporary <a> element to trigger download
      //     const a = document.createElement('a');
      //     a.href = url;
      //     a.download = 'processed-video.mp4'; // Name the downloaded file
      //     document.body.appendChild(a); // Append to the DOM
      //     a.click(); // Programmatically click to trigger the download
      //     a.remove(); // Remove the element after triggering the download
      
      //     // Optionally revoke the object URL after the download
      //     URL.revokeObjectURL(url);
      //   } else {
      //     console.error('Video processing failed.');
      //   }
      // };

      const handleFileNameChange = (e) => {
        setFileName(e.target.value);
      };
    
      const handleCloseExportModal = () => {
        setShow(false);
      };
      
  return (
    <div>

<button className='btn btn-primary' onClick={ShowDialog}>Burn Subtitle to video(Sever)</button>

<Modal show={show} onHide={handleCloseExportModal}>
  <Modal.Header closeButton>
    <Modal.Title>Burn Subtitle to Video</Modal.Title>
  </Modal.Header>
  <Modal.Body>
    <Form>
      <Form.Group controlId="formFileName">
        <Form.Label>File Name</Form.Label>
        {/* <Form.Control
          type="text"
          placeholder="Enter file name"
          value={fileName}
          onChange={handleFileNameChange}
        /> */}
        <input type="file" accept="video/*" onChange={handleVideoFileChange} />
         <br></br>
         {/* {videoFile!=null ? "Video from player is already selected": "" } */}
         {videoFile instanceof File ? "Video from player is already selected, no need to select again" : ""}

      </Form.Group>
    </Form>
  </Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={handleCloseExportModal}>
      Cancel
    </Button>
    <Button variant="primary" onClick={handleProcessVideo} disabled={progress !=0 || videoFile==null }>
    {progress ==100 ? 'Processing at server' : progress== 0 ? 'Process Video' :progress+' % Uploaded'}
    </Button>
   
    {processing && (
        <div className='processing-indicator'>
            <LoadingSpinner />
            <p>Processing...</p>
        </div>
    )}
   
  </Modal.Footer>
</Modal>
</div>

  )
}

export default SeverProcessing