const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');



const app = express();
const upload = multer({ dest: 'uploads/' }); // Handle file uploads
app.use(cors());

app.post('/process-video', upload.fields([{ name: 'videoFile' }, { name: 'subtitleFile' }]), (req, res) => {
  const videoFilePath = path.join(__dirname, req.files.videoFile[0].path);
  const subtitleFilePath = path.join(__dirname, req.files.subtitleFile[0].path);
  const outputFilePath = path.join(__dirname, 'output.mp4');

  // Command to execute native FFmpeg
  const ffmpeg = spawn('ffmpeg', [
    '-i', videoFilePath,                // Input video
    '-vf', `subtitles=${subtitleFilePath}:force_style='Fontname=Arial'`, // Add subtitles
    '-c:v', 'libx264',                  // Video codec
    '-preset', 'ultrafast',              // Encoding speed preset
    '-c:a', 'aac',                      // Audio codec
    '-threads', '4',                    // Multithreading
    outputFilePath                      // Output file
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  
  ffmpeg.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  ffmpeg.on('close', (code) => {
    if (code === 0) {
      // Send processed file back
      res.download(outputFilePath, (err) => {
        if (err) {
          res.status(500).send('Error in downloading processed file.');
        }

        // Cleanup: remove uploaded and processed files
        fs.unlink(videoFilePath, () => {});
        fs.unlink(subtitleFilePath, () => {});
        fs.unlink(outputFilePath, () => {});
      });
    } else {
      res.status(500).send('FFmpeg processing failed.');
    }
  });

  ffmpeg.on('error', (err) => {
    res.status(500).send(`FFmpeg error: ${err.message}`);
  });
  
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
