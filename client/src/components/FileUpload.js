import React, { useState } from 'react';
import axios from 'axios';
import './FileUpload.css';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const FileUpload = ({ onQuizGenerated }) => {
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF or image file (JPEG, PNG, GIF)');
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    if (!subject.trim()) {
      setError('Please enter a subject/category for this quiz');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Build quiz package with subject and metadata
      const quizPackage = {
        subject: subject.trim(),
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString()
        },
        questions: Array.isArray(response.data.quiz) ? response.data.quiz : []
      };

      onQuizGenerated(quizPackage);
      setSubject('');
      setFile(null);
    } catch (err) {
      setError(
        err.response?.data?.error || 
        'Failed to process file. Please make sure the server is running and you have set your Gemini API key.'
      );
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-upload">
      <div
        className={`upload-area ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="upload-icon">📄</div>
        <h3>Upload Lecture Slides</h3>
        <p>Drag and drop your PDF or image file here, or click to browse</p>
        <input
          type="file"
          id="file-input"
          accept=".pdf,.jpg,.jpeg,.png,.gif"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input" className="browse-button">
          Browse Files
        </label>
        {file && (
          <div className="selected-file">
            <span>Selected: {file.name}</span>
            <button onClick={() => setFile(null)} className="remove-file">×</button>
          </div>
        )}
      </div>

      <div className="subject-input-container">
        <label htmlFor="subject-input" className="subject-label">
          Subject / Category
        </label>
        <input
          type="text"
          id="subject-input"
          className="subject-input"
          placeholder="e.g., Mathematics, History, Biology..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={uploading}
        />
        <p className="subject-hint">This helps organize your quizzes by subject</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        className="upload-button"
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Processing...' : 'Generate Quiz'}
      </button>

      {uploading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Extracting text and generating quiz questions...</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;

