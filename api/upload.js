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

async function generateQuiz(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

  let jsonText = responseText;
  if (responseText.includes('```json')) {
    jsonText = responseText.split('```json')[1].split('```')[0].trim();
  } else if (responseText.includes('```')) {
    jsonText = responseText.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonText);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  throw new Error('Unexpected quiz response format from model');
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
    const { file } = await parseUpload(req);
    uploadedFile = file;

    const filePath = file.filepath;
    const ext = path.extname(file.originalFilename || '').toLowerCase();

    let extractedText = '';
    if (ext === '.pdf') {
      extractedText = await extractTextFromPDF(filePath);
    } else {
      extractedText = await extractTextFromImage(filePath);
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({
        error: 'Could not extract sufficient text from the file. Please ensure the file contains readable text.'
      });
    }

    const quiz = await generateQuiz(extractedText);
    await cleanupFile(filePath);

    return res.status(200).json({
      quiz,
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

