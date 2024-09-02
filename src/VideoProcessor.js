import React, { useState, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { Modal, Button, Form } from 'react-bootstrap';
import LoadingSpinner from './LoadingSpinner';
import './VideoProcessor.css';



const VideoProcessor = ({ Entries, VideoFile }) => {
   

    const [ffmpeg, setFfmpeg] = useState(null);
    const [outputFile, setOutputFile] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [videoFile, setVideoFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [show,setShow] =useState(false)

   
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
    useEffect(() => {
        const loadFFmpeg = async () => {
            const ffmpegInstance = new FFmpeg({ log: true });
            ffmpegInstance.on('log', ({ type, message }) => {
                console.log(`[${type}] ${message}`);
            });
            await ffmpegInstance.load();
            setFfmpeg(ffmpegInstance);
        };
    
        loadFFmpeg();
    }, []);




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

    // Process video with subtitles
    const processVideo = async () => {
        if (!ffmpeg || !videoFile || !Entries) return;

        setProcessing(true);

        try {
            // Convert video file to ArrayBuffer
            const videoArrayBuffer = await videoFile.arrayBuffer();

            // Convert SRT entries to SRT content
            const srtContent = convertToSrt(Entries);
            const srtBlob = new Blob([srtContent], { type: 'text/srt' });
            const srtArrayBuffer = await srtBlob.arrayBuffer();
           
            // Load files into FFmpeg
            await ffmpeg.writeFile('input.mp4', new Uint8Array(videoArrayBuffer));
            await ffmpeg.writeFile('subtitles.srt', new Uint8Array(srtArrayBuffer));
            await ffmpeg.writeFile('arial.ttf', await fetchFile('https://raw.githubusercontent.com/ffmpegwasm/testdata/master/arial.ttf'));

            // Run FFmpeg command to hardwire subtitles to video
           // const command = `-i input.mp4 -vf "subtitles=input.srt:force_style='FontName=Arial'" output.mp4`;
           const sContent = await ffmpeg.readFile('subtitles.srt');
           const sText = new TextDecoder().decode(sContent);

           console.log(sText);

        //    await ffmpeg.exec([
        //     '-i', 'subtitles.srt',
            
        //     'subtitles.ass'
        //   ]);

        //   const ssaFileContent = await ffmpeg.readFile('subtitles.ssa');
        //   const ssaText = new TextDecoder().decode(ssaFileContent);
        //   console.log('SSA File Content:', ssaText);
          
          await ffmpeg.exec([
            '-i', 'input.mp4',
            '-vf', "subtitles=subtitles.srt:fontsdir=.:force_style='Fontname=Arial'",
            '-c:v', 'libx264', // Ensures video encoding
             "-preset","ultrafast",
            '-c:a', 'aac',    // Ensures audio encoding
            '-threads', '4', 
            'output.mp4'
        ]);
           


        
     
        
        // await ffmpeg.exec([
        //     '-i', 'input.mp4', // Input video file
        //     '-vf', "subtitles=subtitles.srt:fontsdir=.:force_style='Fontname=Arial'", // Subtitle filter
        //     '-c:v', 'libx264', // Video codec
        //     '-preset', 'fast', // Faster encoding speed
        //     '-crf', '23', // Balancing quality and file size (higher value = faster encoding)
        //     '-c:a', 'aac', // Audio codec
        //     '-b:a', '192k', // Audio bitrate
        //     '-pix_fmt', 'yuv420p', // Compatibility for players
        //     '-movflags', '+faststart', // Optimizes file for streaming
        //     'output.mp4' // Output file
        // ]);
        
        
     
            // Read the processed file
            const data = await ffmpeg.readFile('output.mp4');

            // Create a URL for the processed file
            const outputUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
            setOutputFile(outputUrl);

            downloadFile(outputUrl, 'output.mp4');


        } catch (error) {
            console.error('Error processing video:', error);
        } finally {
            setProcessing(false);
        }
    };


    const downloadFile = (url, filename) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
    };

    const handleFileNameChange = (e) => {
        setFileName(e.target.value);
      };
    
      const handleCloseExportModal = () => {
        setShow(false);
      };
    

    return (

<div>
<button onClick={ShowDialog}>Burn Subtitle to video</button>

            <Modal show={show} onHide={handleCloseExportModal}>
              <Modal.Header closeButton>
                <Modal.Title>Burn Subtitle to Video</Modal.Title>
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
                     <input type="file" accept="video/*" onChange={handleVideoFileChange} />
                     <br></br>
                     {/* {videoFile!=null ? "Video from player is already selected": "" } */}
                     {videoFile instanceof File ? "Video from player is already selected" : ""}

                  </Form.Group>
                </Form>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={handleCloseExportModal}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={processVideo} disabled={processing || videoFile==null }>
                {processing ? 'Processing' : 'Process Video'}
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
          );
        }
        
        // <div>
        //     <h2>Process Video with Subtitles</h2>
        //     <input type="file" accept="video/*" onChange={handleVideoFileChange} />
        //     <button onClick={processVideo} disabled={processing || !videoFile}>
        //         {processing ? 'Processing...' : 'Process Video'}
        //     </button>
        //     {outputFile && (
        //         <div>
        //             <h3>Processed Video</h3>
                    
        //         </div>
        //     )}
        // </div>
   

export default VideoProcessor;
