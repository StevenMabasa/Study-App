const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TMP_DIR = path.join('/tmp', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function ensureTmpDir() {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Missing GEMINI_API_KEY environment variable');
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

function throwGenerationError(error, contentType) {
  console.error(`Error generating ${contentType}:`, error);

  if (error?.message?.includes('reported as leaked')) {
    throw new Error('The Gemini API key on the backend was disabled after being exposed. Add a new GEMINI_API_KEY in Render and restart the backend.');
  }

  throw new Error(`Error generating ${contentType}: ${error.message}`);
}

function getSingleFieldValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getRequestedMode(req, fields) {
  const requestUrl = new URL(req.url, 'http://localhost');
  return String(requestUrl.searchParams.get('mode') || getSingleFieldValue(fields?.mode) || 'quiz')
    .trim()
    .toLowerCase();
}

async function parseUpload(req) {
  await ensureTmpDir();

  return new Promise((resolve, reject) => {
    const form = formidable({
      multiples: false,
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
      uploadDir: TMP_DIR
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }

      const fileFields = Object.values(files || {});
      const fileCandidate = fileFields.length > 0 ? fileFields[0] : null;
      const file = Array.isArray(fileCandidate) ? fileCandidate[0] : fileCandidate;

      if (!file || !file.filepath) {
        return reject(new Error('No file uploaded'));
      }

      resolve({ fields, file });
    });
  });
}

async function extractTextFromPDF(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromImage(filePath) {
  const worker = await createWorker('eng');
  try {
    const { data: { text } } = await worker.recognize(filePath);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractTextFromFile(filePath, fileExtension) {
  if (fileExtension === '.pdf') {
    return extractTextFromPDF(filePath);
  }

  return extractTextFromImage(filePath);
}

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

async function cleanupFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.warn('Temporary file cleanup failed:', err.message);
  }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let uploadedFile;
  try {
    const { fields, file } = await parseUpload(req);
    uploadedFile = file;

    const mode = getRequestedMode(req, fields);
    const subject = String(getSingleFieldValue(fields?.subject) || '').trim();

    if (!['quiz', 'lesson'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use "quiz" or "lesson".' });
    }

    const filePath = file.filepath;
    const ext = path.extname(file.originalFilename || '').toLowerCase();
    const extractedText = await extractTextFromFile(filePath, ext);

    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({
        error: 'Could not extract sufficient text from the file. Please ensure the file contains readable text.'
      });
    }

    const content =
      mode === 'lesson'
        ? { lesson: await generateLesson(extractedText, subject) }
        : { quiz: await generateQuiz(extractedText, subject) };

    await cleanupFile(filePath);

    return res.status(200).json({
      mode,
      subject,
      ...content,
      extractedText: extractedText.substring(0, 500)
    });
  } catch (err) {
    if (uploadedFile?.filepath) {
      await cleanupFile(uploadedFile.filepath);
    }

    console.error('Upload handler error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process upload' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
    sizeLimit: '50mb'
  }
};

