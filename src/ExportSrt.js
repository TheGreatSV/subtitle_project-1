import React,{useState} from 'react'
import srtParser2 from "srt-parser-2";
import ExportDialog from './ExportDialog';

function ExportSrt({Entries}) {
   
    const[show,setShow]=useState(false)

    const ShowDialog=()=>
    {
        setShow(true)
    }
    const convertToSrt = (Entries) => {
        return Entries
          .map((entry, index) => {
            const { startTime, endTime, Text } = entry;
            return `${index + 1}\n${startTime} --> ${endTime}\n${Text}\n`;
          })
          .join('\n');
      };

      
      const saveSrtFile = (entries, filename) => {
        const srtContent = convertToSrt(entries);
        const blob = new Blob([srtContent], { type: 'text/srt' });
        const url = URL.createObjectURL(blob);
      
        const link = document.createElement('a');
        link.href = url;
        link.download = filename+'.srt';
        document.body.appendChild(link);
        link.click();
      
        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };
      
    
  return (
    <div>
    <button onClick={ShowDialog}>Export SRT</button>
    <ExportDialog show={show} saveSrtFile={ saveSrtFile} convertToSrt={convertToSrt} Entries={Entries} setShow={setShow} />
    </div>
  )
}

export default ExportSrt