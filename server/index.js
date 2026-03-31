require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('uploads'));

// Initialize Google Gemini (user will need to set GEMINI_API_KEY in .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'your-api-key-here');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed!'));
    }
  }
});

// Extract text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(`Error extracting text from PDF: ${error.message}`);
  }
}

// Extract text from image using OCR
async function extractTextFromImage(filePath) {
  try {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    return text;
  } catch (error) {
    throw new Error(`Error extracting text from image: ${error.message}`);
  }
}

// Generate quiz using Google Gemini
async function generateQuiz(text) {
  try {
    const prompt = `You are a helpful assistant that creates educational quizzes.

Based on the following lecture content, create a quiz with EXACTLY 20 questions, with this mix:
- 10 multiple_choice questions
- 5 true_false questions
- 5 short_answer questions

Return ONLY valid JSON. No markdown, no extra commentary.

Format your response as a JSON array where each question is an object with these fields:
- type: one of "multiple_choice", "true_false", "short_answer"
- question: the question text
- options: for "multiple_choice" and "true_false" provide options, otherwise []
- correctAnswer: for "multiple_choice" provide an integer index 0-3, for "true_false" provide integer index 0-1, for "short_answer" set null
- acceptableAnswers: for "short_answer" provide an array of 1-3 acceptable answers (strings). For other types use [].

Rules:
- multiple_choice: options must be exactly 4 strings (A,B,C,D order). Only one correct option.
- true_false: options must be exactly ["True","False"] in that order. Only one correct.
- short_answer: options must be []. The correct answer should be concise. Provide acceptableAnswers for common correct variations.

Lecture content:
${text.substring(0, 30000)}

Return ONLY the JSON array of 20 question objects.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text().trim();
    
    // Clean the response to extract JSON
    let jsonText = responseText;
    if (responseText.includes('```json')) {
      jsonText = responseText.split('```json')[1].split('```')[0].trim();
    } else if (responseText.includes('```')) {
      jsonText = responseText.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonText);
    // Be tolerant if the model wraps output (array vs { questions: [...] }).
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    throw new Error('Unexpected quiz response format from model');
  } catch (error) {
    console.error('Error generating quiz:', error);
    throw new Error(`Error generating quiz: ${error.message}`);
  }
}

// Upload and process file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let extractedText = '';

    // Extract text based on file type
    if (fileExtension === '.pdf') {
      extractedText = await extractTextFromPDF(filePath);
    } else {
      // Image file
      extractedText = await extractTextFromImage(filePath);
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract sufficient text from the file. Please ensure the file contains readable text.' });
    }

    // Generate quiz
    const quiz = await generateQuiz(extractedText);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ quiz, extractedText: extractedText.substring(0, 500) }); // Return first 500 chars for preview
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

