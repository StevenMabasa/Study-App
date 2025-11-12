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

  const prompt = `You are a helpful assistant that creates educational quizzes. Based on the following lecture content, create a comprehensive quiz with 20 multiple-choice questions. 
Each question should have 4 options (A, B, C, D) and only one correct answer. 
Format your response as a JSON array where each question has:
- question: the question text
- options: array of 4 options
- correctAnswer: the index (0-3) of the correct option

Lecture content:
${text.substring(0, 30000)}

Return ONLY valid JSON array, no other text or markdown formatting.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const responseText = response.text().trim();

  let jsonText = responseText;
  if (responseText.includes('```json')) {
    jsonText = responseText.split('```json')[1].split('```')[0].trim();
  } else if (responseText.includes('```')) {
    jsonText = responseText.split('```')[1].split('```')[0].trim();
  }

  return JSON.parse(jsonText);
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

