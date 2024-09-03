import './App.css';
import React, { useState} from 'react';
import ReactPlayer from 'react-player';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Modal, Button, Form } from 'react-bootstrap';
import EditEntry from './EditEntry';
import DeleteEntry from './DeleteEntry';
import ImportSrt from './ImportSrt';
import ExportSrt from './ExportSrt';
import VideoProcessor from './VideoProcessor';
import {useEffect, useRef} from 'react'
import AutoSubtitle from './AutoSubtitle';
import { useNavigate } from 'react-router-dom';
import Errorchecking from './Errorchecking';




function App() {
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
          Array.from(videoElement.textTracks).forEach(track => {
            if (track.kind === 'subtitles') {
              track.mode = 'disabled'; // Disable the track
              // There is no removeChild method for textTracks, just disable them
            }
          });

          const track = document.createElement('track');
          track.kind = 'subtitles';
          track.src = objectURL;
          track.srclang = 'en';
          track.label = 'English';
          track.default = true;

          videoElement.appendChild(track);
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
    <div className="app">
      <header className="header">
        <ExportSrt Entries={Entries} />
        <ImportSrt setEntries={setEntries} SetDivs={SetDivs} setIndex={setIndex} />
        <Errorchecking Entries={Entries}/>
        <VideoProcessor Entries={Entries} VideoFile={VideoFile} />
        {/* <AutoSubtitle url={url}/> */}
        <div>
        <label>Open Video:  </label>
        <input type="file" accept="video/*" onChange={handleFileChange} />
        </div>
      </header>

      <div className="main-content">
      <div className="scroll-container">
      <div className="row">
     
      <div className="video-section">
          <ReactPlayer
           ref={playerRef}
            className="react-player"
            url={url}
            width="100%"
            height="300px"
            controls={true}
            progressInterval={100}
            onProgress={handleProgress}
            config={videoConfig}
            playing={isPlaying}
            onPlay={handlePlay} 
          />
          <div style={{marginTop:8}}>
          <label>currentPosition: </label> <label style={{marginRight:10}}>{currentPosition}</label>
          <button className='btn btn-secondary' onClick={handletimingselection}>select current video position</button>
          </div>
          <div className="controls">
            <Form.Group controlId="index">
              {/* <Form.Label>Index:</Form.Label> */}
              <Form.Control type="text" value={subIndex} onChange={e => setIndex(e.target.value)} placeholder="Index" />
            </Form.Group>
            <br></br>
            <Form.Group controlId="startTime">
              {/* <Form.Label>Start Time:</Form.Label> */}
              <Form.Control type="text" value={row.startTime} onChange={handleChange} placeholder="00:00:00,000" />
            </Form.Group>
            <br></br>
            <Form.Group controlId="endTime">
              {/* <Form.Label>End Time:</Form.Label> */}
              <Form.Control type="text" value={row.endTime} onChange={handleChange} placeholder="00:00:00,000" />
            </Form.Group>
            <br></br>
            <Form.Group controlId="text">
              {/* <Form.Label>Text:</Form.Label> */}
              <Form.Control type="text" onChange={e => setRow({ ...row, Text: e.target.value })} placeholder="Text" />
            </Form.Group>
            <Button onClick={AddEntries}>Add</Button>
          </div>
        </div>
        </div>
       
        </div>
        <div className="scroll-container">
        <div className="row-md-6">
        
        <div className="entries-section">
         
        
          {Divs.map((div, index) => (
            <div key={div} className="entry-card">
              <div>{+index+1}</div>
              <div><strong>Start:</strong> {Entries[index].startTime}</div>
              <div><strong>End:</strong> {Entries[index].endTime}</div>
              <div><strong>Text:</strong> {Entries[index].Text}</div>
              <Button variant="danger" onClick={() => showDelete(index)}>Delete</Button>
              <Button onClick={() => openModal(index)}>Edit</Button>
            </div>
          ))}
        </div>
     </div>
      </div>
      </div>
      

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

export default App;
