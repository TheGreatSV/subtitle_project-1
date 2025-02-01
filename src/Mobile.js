import './Mobile.css';
import React, { useState} from 'react';
import ReactPlayer from 'react-player';
import 'bootstrap/dist/css/bootstrap.min.css';
import EditEntry from './EditEntry';
import DeleteEntry from './DeleteEntry';
import ImportSrt from './ImportSrt';
import ExportSrt from './ExportSrt';
import VideoProcessor from './VideoProcessor';
import {useEffect, useRef} from 'react'
import { useNavigate } from 'react-router-dom';
import Errorchecking from './Errorchecking';
import SeverProcessing from './SeverProcessing';
import ShiftTiming from './ShiftTiming';
import BulkDelete from './BulkDelete';
import MobileWarning from './MobileWarning';
import { Modal, Button, Form, Container, Row, Col } from 'react-bootstrap'; // Added Bootstrap grid components
function Mobile() {

    const [Entries, setEntries] = useState([])
      const [row, setRow] = useState({ id: '', startTime: '', endTime: '', Text: '' });
      const [subIndex, setIndex] = useState(1);
      const [Divs, SetDivs] = useState([]);
      const [selectedIndex, setSelectedIndex] = useState(null);
      const [show, setShow] = useState(false);
      const [url, ChangeURL] = useState('txt');
      const [currentPosition, setCurrentTime] = useState(0);
      const [delIndex, setDelIndex] = useState('');
      const [delshow, setDelShow] = useState(false);
      const [VideoFile,ChangeVideoFile]=useState('');
      const [projectName, setProjectName] = useState('');
      const [webVtt, setWebVtt] = useState('');
      const playerRef = useRef(null);
      const [isPlaying, setIsPlaying] = useState(false);
      const [endTime, setEndTime] = useState('');
      const navigate = useNavigate();
      const [highlightIndices,setHighlight]=useState([])
      const fileInputRef = useRef(null);
    
     
    
      const [videoConfig, setVideoConfig] = useState({
        file: {
          tracks: [
            {
              kind: 'subtitles',
              src: '',
              srcLang: 'en',
              default: true
            }
          ]
        }
      });
      useEffect(() => {
        
        const storedProjectName = sessionStorage.getItem('project');
        if(storedProjectName == null){
          navigate('/')
        }
         setProjectName(storedProjectName);
         const savedEntries = localStorage.getItem(`${storedProjectName}Entries`);
         const savedDivs = localStorage.getItem(`${storedProjectName}Divs`);
         const  VideoURL= localStorage.getItem(`${storedProjectName}video`);
         const VideoFile=localStorage.getItem(`${storedProjectName}videofile`);
         ChangeVideoFile(VideoFile)
         ChangeURL(VideoURL)
        if (savedEntries && savedDivs) {
          setEntries(JSON.parse(savedEntries));
          SetDivs(JSON.parse(savedDivs));
          setIndex(+JSON.parse(savedEntries).length+1)
        }else{
          setEntries([])
          SetDivs([])
        }
      }, []);
    
      // Save data to localStorage whenever entries or divs change
      useEffect(() => {
        if (Entries.length > 0 && Divs.length > 0) {
          localStorage.setItem(`${projectName}Entries`, JSON.stringify(Entries));
          localStorage.setItem(`${projectName}Divs`, JSON.stringify(Divs));
          const vtt = convertSrtToWebVtt(Entries);
          
          const blob = new Blob([vtt], { type: 'text/vtt' });
    
          const objectURL= URL.createObjectURL(blob);
          if (playerRef.current) {
            const videoElement = playerRef.current.getInternalPlayer();
            if (videoElement) {
              // Clear existing subtitle tracks
              // Array.from(videoElement.textTracks).forEach(track => {
              //   if (track.kind === 'subtitles') {
              //     track.mode = 'disabled';
              //     track.remove(); // Disable the track
              //     // There is no removeChild method for textTracks, just disable them
              //   }
              // });
    
              const tracks = videoElement.querySelectorAll('track');
              tracks.forEach(track => track.remove()); // Remove the <track> elements
    
              const track = document.createElement('track');
              track.kind = 'subtitles';
              track.src = objectURL;
              track.srclang = 'en';
              track.label = 'English';
              track.default = true;
    
              videoElement.appendChild(track);
    
              requestAnimationFrame(() => {
                const textTracks = videoElement.textTracks;
                Array.from(textTracks).forEach(textTrack => {
                  if (textTrack.kind === 'subtitles' && textTrack.label === 'English') {
                    textTrack.mode = 'showing'; // Enable the new track
                  }
                });
              });
            }
          }
    
          return () => URL.revokeObjectURL(objectURL);
        }
      }, [Entries, Divs]);
    
      useEffect(()=>{
        localStorage.setItem(`${projectName}video`,url);
        localStorage.setItem(`${projectName}videofile`,VideoFile);
    
      },[url]);
    
      const convertSrtToWebVtt = (srtEntries) => {
        let vtt = 'WEBVTT\n\n';
        
        srtEntries.forEach((entry, index) => {
          const { startTime, endTime, Text } = entry;
          const start = startTime.replace(',', '.');
          const end = endTime.replace(',', '.');
          
          vtt += `${index + 1}\n`;
          vtt += `${start} --> ${end}\n`;
          vtt += `${Text}\n\n`;
        });
        
        return vtt;
      };
      
    
      const openModal = (index) => {
        setSelectedIndex(index);
        setShow(true);
      };
    
      
      const handleClose = () => setShow(false);
      const handleCloseDelete = () => setDelShow(false);
    
      const handleSave = (updatedEntry) => {
        const updatedEntries = [...Entries];
        updatedEntries[updatedEntry.index] = updatedEntry;
        setEntries(updatedEntries);
        handleClose();
      };
    
      const AddEntries = () => {
    
        if(row.startTime.length ==12 && row.endTime.length==12)
        {
        if (Entries.length === subIndex - 1) {
          SetDivs([...Divs, Entries.length + 1]);
          setEntries([...Entries, row]);
          setIndex(+subIndex + 1);
        } else {
          const updatedEntries = [...Entries];
          updatedEntries.splice(subIndex - 1, 0, row);
    
          const updatedDivs = [...Divs];
          updatedDivs.splice(subIndex - 1, 0, updatedEntries.length);
    
          setEntries(updatedEntries);
          SetDivs(updatedDivs);
          setIndex(+subIndex + 1);
        }
      }else{
        alert("Start time or End time format is invalid!!!")
      }
      };
    
      const handleChange = (e) => {
        const { id, value } = e.target;
        const formattedVal = format(value);
        switch (id) {
          case 'startTime':
            setRow({ ...row, startTime: formattedVal });
            break;
          case 'endTime':
            setRow({ ...row, endTime: formattedVal });
            break;
          default:
            break;
        }
      };
    
      const format = (val) => {
        let numericValue = val.replace(/\D/g, '');
        let formatted = '';
        if (numericValue.length > 0) {
          formatted = numericValue.slice(0, 2);
          if (numericValue.length > 2) {
            formatted += ':' + numericValue.slice(2, 4);
          }
          if (numericValue.length > 4) {
            formatted += ':' + numericValue.slice(4, 6);
          }
          if (numericValue.length > 6) {
            formatted += ',' + numericValue.slice(6, 9);
          }
        }
        return formatted;
      };
    
      const handleFileChange = (e) => {
        const VideoURL = URL.createObjectURL(e.target.files[0]);
        ChangeVideoFile(e.target.files[0])
        ChangeURL(VideoURL);
      };
    
      const handleProgress = (state) => {
        setCurrentTime(formatDuration(state.playedSeconds));
        setEndTime(formatDuration(+state.playedSeconds+2))
      };
    
      const formatDuration = (seconds) => {
        const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
        const totalSeconds = Math.floor(seconds);
        const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs},${ms}`;
      };
    
      const showDelete = (index) => {
        setDelIndex(index);
        setDelShow(true);
        
      };
    
      const handleDelete = () => {
        setEntries(Entries.filter((_, index) => index !== delIndex));
        SetDivs(Divs.filter((_, index) => index !== delIndex));
        setIndex(Entries.length);
        const updatedHighlight=highlightIndices.filter(item => item !==delIndex)
        setHighlight(updatedHighlight)
        handleCloseDelete();
      };
    
      const handletimingselection=()=>{
       setIsPlaying(false)
       setRow({startTime:currentPosition, endTime:endTime})
      //  row.startTime=currentPosition
      //  row.endTime=endTime
    
      // playerRef.current.getCurrentTime()	
      }
    
      const handlePlay=()=>{
        setIsPlaying(true)
      }
    
      const selectVideo=()=>{
        fileInputRef.current.click();
      }
      
    
      // useEffect(() => {
      //   setVideoConfig({
      //     file: {
      //       tracks: [
      //         {
      //           kind: 'subtitles',
      //           src: URL.createObjectURL(new Blob([webVtt], { type: 'text/vtt' })),
      //           srcLang: 'en',
      //           default: true
      //         }
      //       ]
      //     }
      //   });
      // }, [webVtt]);
      
     
  return (
    <div className="Mobile">
    <header className="header">
      {/* Wrap header content in a responsive container */}
      <Container fluid>
        <div className="d-flex flex-wrap gap-2 justify-content-center py-2">
          <ExportSrt Entries={Entries} />
          <ImportSrt setEntries={setEntries} SetDivs={SetDivs} setIndex={setIndex} />
          <Errorchecking Entries={Entries} setHighlight={setHighlight} />
          <VideoProcessor Entries={Entries} VideoFile={VideoFile} />
          <ShiftTiming Entries={Entries} setEntries={setEntries} formatDuration={formatDuration} />
          <BulkDelete Entries={Entries} setEntries={setEntries} Divs={Divs} setDivs={SetDivs} />
          <div>
            <button className='btn btn-primary btn-sm' onClick={selectVideo}>
              <i className="bi bi-film"></i> Open Video
            </button>
            <input type="file" hidden ref={fileInputRef} accept="video/*" onChange={handleFileChange} />
          </div>
        </div>
      </Container>
    </header>

    <Container fluid className="main-content">
      <Row className="g-3">
        {/* Video Section - Full width on mobile, 6 columns on desktop */}
        <Col md={6} className="video-section">
          <div className="position-relative" style={{ paddingTop: '56.25%' /* 16:9 aspect ratio */ }}>
            <ReactPlayer
              ref={playerRef}
              className="react-player position-absolute top-0 start-0"
              url={url}
              width="100%"
              height="100%"
              controls={true}
              progressInterval={100}
              onProgress={handleProgress}
              config={videoConfig}
              playing={isPlaying}
              onPlay={handlePlay}
            />
          </div>
          
          <div className="mt-2 d-flex flex-column gap-2">
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small">Current:</span>
              <span className="small">{currentPosition}</span>
              <button 
                className="btn btn-sm btn-outline-secondary ms-auto"
                onClick={handletimingselection}
              >
                <i className="bi bi-gear"></i> Select video Position
              </button>
            </div>
            
            <div className="controls bg-light p-2 rounded">
              <Row className="g-2">
                <Col xs={12} sm={3}>
                  <Form.Control
                    type="number"
                    value={subIndex}
                    onChange={e => setIndex(e.target.value)}
                    placeholder="Index"
                    min="1"
                  />
                </Col>
                <Col xs={6} sm={3}>
                  <Form.Control
                    type="text"
                    value={row.startTime}
                    onChange={handleChange}
                    placeholder="00:00:00,000"
                    id="startTime"
                  />
                </Col>
                <Col xs={6} sm={3}>
                  <Form.Control
                    type="text"
                    value={row.endTime}
                    onChange={handleChange}
                    placeholder="00:00:00,000"
                    id="endTime"
                  />
                </Col>
                <Col xs={12} sm={3}>
                  <Form.Control
                    type="text"
                    value={row.Text}
                    onChange={e => setRow({ ...row, Text: e.target.value })}
                    placeholder="Subtitle Text"
                  />
                </Col>
                <Col xs={12}>
                  <Button className="w-100" onClick={AddEntries}>
                    <i className="bi bi-plus-lg"></i> Add Entry
                  </Button>
                </Col>
              </Row>
            </div>
          </div>
        </Col>

        {/* Entries Section - Full width on mobile, 6 columns on desktop */}
        <Col md={6} className="entries-section">
          <div className="scroll-container-mobile">
            <Row xs={1} md={2} className="g-2">
              {Divs.map((div, index) => (
                <Col key={div}>
                  <div className={`entry-card ${highlightIndices.includes(index) ? 'entry-card-highlight' : ''}`}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="badge bg-primary">#{index + 1}</div>
                      <div className="d-flex gap-1">
                        <Button variant="danger" onClick={() => showDelete(index)}>Delete</Button>
                                     <Button onClick={() => openModal(index)}>Edit</Button>
                      </div>
                    </div>
                    <div className="small mt-2">
                      <div className="text-muted">Start: {Entries[index].startTime}</div>
                      <div className="text-muted">End: {Entries[index].endTime}</div>
                      <div className="mt-1">{Entries[index].Text}</div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        </Col>
      </Row>
    </Container>

      

      <EditEntry
        Entries={Entries}
        show={show}
        handleClose={handleClose}
        selectedIndex={selectedIndex}
        handleSave={handleSave}
      />

      <DeleteEntry
        handleDelete={handleDelete}
        handleClose={handleCloseDelete}
        showDelete={delshow}
      />
    </div>
  );
}
export default Mobile