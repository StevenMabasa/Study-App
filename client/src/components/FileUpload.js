import React, { useState } from 'react';
import axios from 'axios';
import './FileUpload.css';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

const modeCopy = {
  quiz: {
    title: 'Generate Quiz',
    description: 'Create 20 questions that test how well you understand the material.',
    loading: 'Extracting text and generating quiz questions...',
    button: 'Generate Quiz'
  },
  lesson: {
    title: 'Create Lesson',
    description: 'Turn the upload into a guided explanation that teaches the topic clearly.',
    loading: 'Extracting text and building your lesson...',
    button: 'Create Lesson'
  }
};

const FileUpload = ({ onContentGenerated }) => {
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState('');
  const [mode, setMode] = useState('quiz');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (event) => {
    if (event.target.files && event.target.files[0]) {
      handleFile(event.target.files[0]);
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
      setError('Please enter a subject or category for this material');
      return;
    }

    setUploading(true);
    setError(null);

    const trimmedSubject = subject.trim();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject', trimmedSubject);
    formData.append('mode', mode);
    const endpoint = `${API_BASE_URL}/api/upload${mode === 'lesson' ? '?mode=lesson' : ''}`;

    try {
      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      const responseMode =
        response.data.mode === 'lesson' || (response.data.lesson && typeof response.data.lesson === 'object')
          ? 'lesson'
          : 'quiz';
      const basePackage = {
        mode: responseMode,
        subject: trimmedSubject,
        extractedText: response.data.extractedText || '',
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString()
        }
      };

      if (responseMode === 'lesson') {
        onContentGenerated({
          ...basePackage,
          lesson: response.data.lesson || {}
        });
      } else {
        onContentGenerated({
          ...basePackage,
          questions: Array.isArray(response.data.quiz) ? response.data.quiz : []
        });
      }

      setSubject('');
      setFile(null);
      setMode('quiz');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Failed to process file. Please make sure the server is running and your Gemini API key is configured.'
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
        <div className="upload-icon">FILE</div>
        <h3>Upload Notes or Lecture Slides</h3>
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
            <button type="button" onClick={() => setFile(null)} className="remove-file">
              x
            </button>
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
          onChange={(event) => setSubject(event.target.value)}
          disabled={uploading}
        />
        <p className="subject-hint">This helps tailor the quiz or lesson to the topic you are studying.</p>
      </div>

      <div className="study-mode-selector">
        <div className="study-mode-header">
          <h4>Choose Study Mode</h4>
          <p>Pick whether you want to be tested or taught.</p>
        </div>

        <div className="mode-options">
          {Object.entries(modeCopy).map(([modeKey, config]) => (
            <button
              key={modeKey}
              type="button"
              className={`mode-card ${mode === modeKey ? 'active' : ''}`}
              onClick={() => setMode(modeKey)}
              disabled={uploading}
            >
              <span className="mode-card-title">{config.title}</span>
              <span className="mode-card-description">{config.description}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="button"
        className={`upload-button ${mode === 'lesson' ? 'lesson-mode' : ''}`}
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Processing...' : modeCopy[mode].button}
      </button>

      {uploading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>{modeCopy[mode].loading}</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
