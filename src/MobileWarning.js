import React from 'react';
import { useEffect, useState } from "react";

function MobileWarning() {

    const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    // Detect if the user is on a mobile device
    const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(
        navigator.userAgent
      );
      

    // Check session storage to ensure the message shows once per session
    const hasSeenMessageThisSession = sessionStorage.getItem("hasSeenMessage");

    if (isMobile && !hasSeenMessageThisSession) {
      setShowMessage(true); // Show the message
      sessionStorage.setItem("hasSeenMessage", "true"); // Mark as shown for this session
    }
  }, []);

  const closeMessage = () => {
    setShowMessage(false); // Hide the message when dismissed
  };

  return (
    <div>
      <h1></h1>
      {showMessage && (
        <div style={styles.messageBox}>
          <p style={styles.messageText}>
            Welcome to our website! Enjoy the best experience on Desktop.
          </p>
          <button style={styles.closeButton} onClick={closeMessage}>
            Close
          </button>
        </div>
    
      )}
      </div>
);
}

const styles = {
    messageBox: {
      position: "fixed",
      top: "50%", // Center vertically
      left: "50%", // Center horizontally
      transform: "translate(-50%, -50%)", // Adjust for the center of the box
      background: "#333",
      color: "#fff",
      padding: "15px 20px",
      borderRadius: "8px",
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.2)",
      zIndex: 1000,
      textAlign: "center", // Center-align text within the box
      maxWidth: "90%", // Ensure it fits on smaller screens
      width: "300px", // Set a standard width for the box
    },
    messageText: {
      margin: 0,
      padding: 0,
    },
    closeButton: {
      marginTop: "10px",
      background: "#ff5e57",
      color: "#fff",
      border: "none",
      padding: "8px 12px",
      borderRadius: "5px",
      cursor: "pointer",
    },
  };
  
export default MobileWarning