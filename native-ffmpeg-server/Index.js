const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// Initialize Express
const app = express();
app.use(cors());

// Configure Multer for file uploads with a 500 MB limit
const upload = multer({
  dest: 'uploads/', // Temporary storage for uploaded files
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB file size limit
});

// Route to handle video processing
app.post('/process-video', upload.fields([{ name: 'videoFile' }, { name: 'subtitleFile' }]), (req, res) => {
  if (!req.files || !req.files.videoFile || !req.files.subtitleFile) {
    return res.status(400).send('Files are missing.');
  }

  const videoFilePath = path.join(__dirname, req.files.videoFile[0].path);
  const subtitleFilePath = path.join(__dirname, req.files.subtitleFile[0].path);
  const outputFilePath = path.join(__dirname, 'output.mp4');

  // Command to execute native FFmpeg
  const ffmpeg = spawn('ffmpeg', [
    '-i', videoFilePath,                // Input video
    '-vf', `subtitles=${subtitleFilePath}:force_style='Fontname=Arial'`, // Add subtitles
    '-c:v', 'libx264',                  // Video codec
    '-crf', '18',                       // Quality (lower value = higher quality)
    '-preset', 'fast',                  // Encoding speed preset
    '-c:a', 'copy',                     // Copy audio without re-encoding
    '-threads', '4',                    // Enable multithreading
    outputFilePath                      // Output file path
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Log FFmpeg output
  ffmpeg.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  ffmpeg.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  // Handle FFmpeg completion
  ffmpeg.on('close', (code) => {
    if (code === 0) {
      // Send processed file back to the client
      res.download(outputFilePath, (err) => {
        if (err) {
          return res.status(500).send('Error in downloading processed file.');
        }

        // Cleanup: remove uploaded and processed files
        fs.unlink(videoFilePath, () => {});
        fs.unlink(subtitleFilePath, () => {});
        fs.unlink(outputFilePath, () => {});
      });
    } else {
      res.status(500).send('FFmpeg processing failed.');
      fs.unlink(videoFilePath, () => {});
      fs.unlink(subtitleFilePath, () => {});
      fs.unlink(outputFilePath, () => {});
    }
  });

  ffmpeg.on('error', (err) => {
    res.status(500).send(`FFmpeg error: ${err.message}`);
  });
});

// Start the server and set a timeout for long-running processes
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Set timeout for larger file uploads and processing (200 seconds or more if needed)
server.setTimeout(300000); // 300 seconds = 5 minutes
