// LoadingModal.jsx
import React from 'react';
import './LoadingModal.css'; // Import the CSS file for styling
import LoadingSpinner from './LoadingSpinner'; // Reuse the spinner component

const LoadingModal = ({ isOpen }) => {
    if (!isOpen) return null; // Don't render anything if not open

    return (
        <div className="loading-modal">
            <div className="modal-content">
                <LoadingSpinner />
                <p>Processing...</p>
            </div>
        </div>
    );
};

export default LoadingModal;
