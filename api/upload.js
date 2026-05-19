const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const TMP_DIR = path.join('/tmp', 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const GENERATION_MODEL = process.env.GEMINI_GENERATION_MODEL || 'gemini-2.5-flash-lite';

async function ensureTmpDir() {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getGeminiModel(modelName = GENERATION_MODEL, generationConfig) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelConfig = { model: modelName };

  if (generationConfig) {
    modelConfig.generationConfig = generationConfig;
  }

  return genAI.getGenerativeModel(modelConfig);
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

const TRUE_FALSE_START_INDEX = 10;

const MULTIPLE_CHOICE_STYLE_PATTERNS = [
  /^which\b/i,
  /^what\b/i,
  /^who\b/i,
  /^when\b/i,
  /^where\b/i,
  /^why\b/i,
  /^how\s+(many|much|long|often|do|does|did|can|could|would|will|is|are|was|were)\b/i,
  /\bwhich of the following\b/i,
  /\bselect the (best|correct)\b/i,
  /\bchoose the (best|correct)\b/i
];

function assertTrueFalseQuestionFormat(questionText, questionNumber) {
  const text = String(questionText || '').trim();

  if (!text) {
    return;
  }

  if (MULTIPLE_CHOICE_STYLE_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(
      `Question ${questionNumber} must be a true/false statement (a factual claim), not a multiple-choice-style question.`
    );
  }
}

const QUIZ_SCHEMA = {
  description: 'A list of study quiz questions.',
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      type: { type: SchemaType.STRING },
      question: { type: SchemaType.STRING },
      options: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      },
      correctAnswer: { type: SchemaType.NUMBER },
      acceptableAnswers: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING }
      }
    },
    required: ['type', 'question', 'options', 'correctAnswer', 'acceptableAnswers']
  }
};

function normalizeQuizQuestions(parsed) {
  const questions = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.questions)
      ? parsed.questions
      : null;

  if (!questions) {
    throw new Error('Unexpected quiz response format from model');
  }

  if (questions.length !== 20) {
    throw new Error(`Expected 20 quiz questions, received ${questions.length}.`);
  }

  return questions.map((question, index) => {
    const questionNumber = index + 1;
    const expectedType = index < TRUE_FALSE_START_INDEX ? 'multiple_choice' : 'true_false';
    const questionText = String(question?.question || '').trim();
    const rawOptions = Array.isArray(question?.options)
      ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];
    const options = expectedType === 'true_false' ? ['True', 'False'] : rawOptions;
    let correctAnswer;

    if (expectedType === 'true_false') {
      const normalizedAnswer = String(question?.correctAnswer ?? '').trim().toLowerCase();
      if (normalizedAnswer === 'true') {
        correctAnswer = 0;
      } else if (normalizedAnswer === 'false') {
        correctAnswer = 1;
      } else {
        correctAnswer = Number(question?.correctAnswer);
      }
    } else {
      correctAnswer = Number(question?.correctAnswer);
    }

    if (!questionText) {
      throw new Error(`Question ${questionNumber} is missing question text.`);
    }

    if (expectedType === 'true_false') {
      assertTrueFalseQuestionFormat(questionText, questionNumber);
    }

    if (expectedType === 'multiple_choice' && options.length !== 4) {
      throw new Error(`Question ${questionNumber} must have exactly 4 answer options.`);
    }

    const maxAnswerIndex = expectedType === 'true_false' ? 1 : 3;
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > maxAnswerIndex) {
      throw new Error(`Question ${questionNumber} must have a correctAnswer index from 0 to ${maxAnswerIndex}.`);
    }

    return {
      type: expectedType,
      question: questionText,
      options,
      correctAnswer,
      acceptableAnswers: []
    };
  });
}

const LESSON_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    overview: { type: SchemaType.STRING },
    learningObjectives: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    sections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          heading: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          keyPoints: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          },
          example: { type: SchemaType.STRING },
          checkYourUnderstanding: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          }
        },
        required: ['heading', 'explanation', 'keyPoints', 'example', 'checkYourUnderstanding']
      }
    },
    summary: { type: SchemaType.STRING },
    studyTips: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    },
    possibleMisconceptions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    }
  },
  required: ['title', 'overview', 'learningObjectives', 'sections', 'summary', 'studyTips', 'possibleMisconceptions']
};

async function generateJsonResponse(prompt, contentType, responseSchema, modelName = GENERATION_MODEL) {
  const model = getGeminiModel(modelName, {
    responseMimeType: 'application/json',
    responseSchema
  });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return parseModelJson(response.text());
}

function throwGenerationError(error, contentType) {
  console.error(`Error generating ${contentType}:`, error);

  if (error?.message?.includes('reported as leaked')) {
    throw new Error('The Gemini API key on the backend was disabled after being exposed. Add a new GEMINI_API_KEY in Render and restart the backend.');
  }

  if (error?.message?.includes('429') && error?.message?.toLowerCase().includes('quota')) {
    throw new Error('Gemini request quota was exceeded for the current model. This app now uses lighter defaults, but you may still need to wait for the quota reset, switch models, or upgrade billing.');
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

Based on the following lecture content, create a quiz with EXACTLY 20 questions in this order:
- Questions 1-10: multiple_choice questions
- Questions 11-20: true_false questions

Return ONLY valid JSON. No markdown, no extra commentary.

Format your response as a JSON array where each question is an object with these fields:
- type: "multiple_choice" for questions 1-10, "true_false" for questions 11-20
- question: the question text
- options: for "multiple_choice" provide exactly 4 answer choices as strings; for "true_false" provide exactly ["True","False"]
- correctAnswer: for "multiple_choice" provide the integer index of the correct option from 0 to 3; for "true_false" provide 0 for True or 1 for False
- acceptableAnswers: always []

Rules:
- Questions 1-10 must be multiple-choice. Questions 11-20 must be true/false.
- Do not create short-answer, fill-in-the-blank, or open-ended questions.
- Multiple-choice options must be exactly 4 strings in A, B, C, D order.
- True/false options must be exactly ["True","False"] in that order.
- Each question must have only one correct option.
- Make the distractors plausible but clearly wrong based on the lecture content.

True/false question rules (questions 11-20):
- Write each question as one declarative statement about the lecture (a factual claim the student marks true or false).
- Do not use multiple-choice wording such as "Which of the following", "What is", "Who", "When", "Where", "Why", "How many", "Select", or "Choose".
- Do not list answer choices inside the question text.
- Good example: "Photosynthesis converts light energy into chemical energy."
- Bad example: "Which process converts light energy into chemical energy?"

Lecture content:
${text.substring(0, 30000)}

Return ONLY the JSON array of 20 question objects in the required order.`;

    const parsed = await generateJsonResponse(prompt, 'quiz', QUIZ_SCHEMA, GENERATION_MODEL);

    return normalizeQuizQuestions(parsed);
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

    const parsed = await generateJsonResponse(prompt, 'lesson', LESSON_SCHEMA, GENERATION_MODEL);

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

