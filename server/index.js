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

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Server configuration error: GEMINI_API_KEY is not set.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

function parseModelJson(responseText) {
  const rawText = String(responseText || '').trim();
  const candidates = [];

  const addCandidate = (value) => {
    const normalized = String(value || '').trim();
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  addCandidate(rawText);

  if (rawText.includes('```json')) {
    addCandidate(rawText.split('```json')[1].split('```')[0]);
  } else if (rawText.includes('```')) {
    addCandidate(rawText.split('```')[1].split('```')[0]);
  }

  const firstBraceIndex = rawText.search(/[\[{]/);
  const lastCurly = rawText.lastIndexOf('}');
  const lastSquare = rawText.lastIndexOf(']');
  const lastBraceIndex = Math.max(lastCurly, lastSquare);

  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    addCandidate(rawText.slice(firstBraceIndex, lastBraceIndex + 1));
  }

  let lastError;

  for (const candidate of candidates) {
    const sanitized = candidate
      .replace(/^\uFEFF/, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .trim();

    const variants = [
      sanitized,
      sanitized.replace(/,\s*([}\]])/g, '$1')
    ];

    for (const variant of variants) {
      try {
        return JSON.parse(variant);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error('Model did not return valid JSON');
}

async function generateJsonResponse(prompt, contentType) {
  const model = getGeminiModel();
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text();

  try {
    return parseModelJson(responseText);
  } catch (parseError) {
    const repairPrompt = `You are fixing malformed JSON for a ${contentType} response.

Return ONLY valid JSON.
Do not use markdown fences.
Do not add commentary.
Preserve the original structure and meaning as closely as possible.

Malformed JSON:
${responseText}`;

    const repairResult = await model.generateContent(repairPrompt);
    const repairResponse = await repairResult.response;
    return parseModelJson(repairResponse.text());
  }
}

function cleanTextResponse(responseText) {
  const rawText = String(responseText || '').trim();
  const fencedMatch = rawText.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);

  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  return rawText;
}

async function generateTextResponse(prompt, contentType) {
  const model = getGeminiModel();
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const reply = cleanTextResponse(response.text());

  if (!reply) {
    throw new Error(`Empty ${contentType} response from model`);
  }

  return reply;
}

function truncateText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: truncateText(message.content, 1500)
    }))
    .filter((message) => message.content)
    .slice(-8);
}

function throwGenerationError(error, contentType) {
  console.error(`Error generating ${contentType}:`, error);

  if (error?.message?.includes('reported as leaked')) {
    throw new Error('The Gemini API key on the backend was disabled after being exposed. Add a new GEMINI_API_KEY in Render and restart the backend.');
  }

  throw new Error(`Error generating ${contentType}: ${error.message}`);
}

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

async function extractTextFromFile(filePath, fileExtension) {
  if (fileExtension === '.pdf') {
    return extractTextFromPDF(filePath);
  }

  return extractTextFromImage(filePath);
}

// Generate quiz using Google Gemini
async function generateQuiz(text, subject = '') {
  try {
    const prompt = `You are a helpful assistant that creates educational quizzes.

Subject/category:
${subject || 'Not provided'}

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

    const parsed = await generateJsonResponse(prompt, 'quiz');

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    throw new Error('Unexpected quiz response format from model');
  } catch (error) {
    throwGenerationError(error, 'quiz');
  }
}

async function generateLesson(text, subject = '') {
  try {
    const prompt = `You are a patient tutor who turns lecture slides into a clear lesson for a student.

Subject/category:
${subject || 'Not provided'}

Based on the lecture content below, create a lesson that teaches the material in simple, student-friendly language.

Return ONLY valid JSON. No markdown, no code fences, no extra commentary.

Use this exact JSON shape:
{
  "title": "string",
  "overview": "string",
  "learningObjectives": ["string", "string", "string"],
  "sections": [
    {
      "heading": "string",
      "explanation": "string",
      "keyPoints": ["string", "string"],
      "example": "string",
      "checkYourUnderstanding": ["string", "string"]
    }
  ],
  "summary": "string",
  "studyTips": ["string", "string", "string"],
  "possibleMisconceptions": ["string", "string"]
}

Rules:
- Create 4 to 6 lesson sections.
- Explain jargon in plain language.
- Use only the information supported by the lecture content.
- Make the explanations feel like a teacher walking the student through the topic.
- Keep examples practical and easy to understand.
- The "checkYourUnderstanding" items should be reflective questions, not answers.
- Keep every field concise but helpful.

Lecture content:
${text.substring(0, 30000)}`;

    const parsed = await generateJsonResponse(prompt, 'lesson');

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.lesson && typeof parsed.lesson === 'object') {
        return parsed.lesson;
      }

      return parsed;
    }

    throw new Error('Unexpected lesson response format from model');
  } catch (error) {
    throwGenerationError(error, 'lesson');
  }
}

async function generateLessonChatReply({ question, subject = '', lesson = {}, extractedText = '', history = [] }) {
  try {
    const recentHistory = normalizeChatHistory(history);
    const conversationText = recentHistory.length
      ? recentHistory
          .map((message) => `${message.role === 'assistant' ? 'Tutor' : 'Student'}: ${message.content}`)
          .join('\n\n')
      : 'No previous conversation.';

    const lessonContext = truncateText(JSON.stringify(lesson, null, 2), 12000) || '{}';
    const sourceContext = truncateText(extractedText, 12000) || 'No source text provided.';
    const safeQuestion = truncateText(question, 2000);

    const prompt = `You are a friendly study tutor helping a student understand their lesson.

Your job:
- Answer the student's question using the lesson and source notes as your primary grounding.
- Explain things clearly, patiently, and in simple language.
- If the student is confused, break the topic into smaller steps.
- Use a short example or analogy when it helps.
- If the answer is not clearly supported by the uploaded material, say that honestly and then give a careful best-effort explanation.
- Do not turn the reply into a quiz unless the student asks.
- Do not return JSON.

Subject/category:
${subject || 'Not provided'}

Lesson structure:
${lessonContext}

Source notes excerpt:
${sourceContext}

Recent conversation:
${conversationText}

Student question:
${safeQuestion}

Write a helpful tutor reply in plain text. Prefer short paragraphs. Use bullets only when they genuinely help clarity.`;

    return await generateTextResponse(prompt, 'lesson chat');
  } catch (error) {
    throwGenerationError(error, 'lesson chat');
  }
}

async function handleStudyUpload(req, res, forcedMode) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const requestedMode = forcedMode || req.query?.mode || req.body?.mode || 'quiz';
    const mode = String(requestedMode).trim().toLowerCase();
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';

    if (!['quiz', 'lesson'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use "quiz" or "lesson".' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const extractedText = await extractTextFromFile(filePath, fileExtension);

    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract sufficient text from the file. Please ensure the file contains readable text.' });
    }

    const content =
      mode === 'lesson'
        ? { lesson: await generateLesson(extractedText, subject) }
        : { quiz: await generateQuiz(extractedText, subject) };

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      mode,
      subject,
      ...content,
      extractedText: extractedText.substring(0, 500)
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
}

// Upload and process file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  await handleStudyUpload(req, res);
});

app.post('/api/lesson', upload.single('file'), async (req, res) => {
  await handleStudyUpload(req, res, 'lesson');
});

app.post('/api/lesson-chat', async (req, res) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

    if (!question) {
      return res.status(400).json({ error: 'Please enter a question.' });
    }

    const reply = await generateLessonChatReply({
      question,
      subject: typeof req.body?.subject === 'string' ? req.body.subject.trim() : '',
      lesson: req.body?.lesson,
      extractedText: typeof req.body?.extractedText === 'string' ? req.body.extractedText : '',
      history: req.body?.history
    });

    return res.json({ reply });
  } catch (error) {
    console.error('Lesson chat error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

