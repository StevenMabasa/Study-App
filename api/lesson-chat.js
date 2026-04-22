const { GoogleGenerativeAI } = require('@google/generative-ai');
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash-lite';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getGeminiModel(modelName = CHAT_MODEL) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

function cleanTextResponse(responseText) {
  const rawText = String(responseText || '').trim();
  const fencedMatch = rawText.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);

  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  return rawText;
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
      content: truncateText(message.content, 600)
    }))
    .filter((message) => message.content)
    .slice(-4);
}

async function generateTextResponse(prompt, contentType, modelName = CHAT_MODEL) {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const reply = cleanTextResponse(response.text());

  if (!reply) {
    throw new Error(`Empty ${contentType} response from model`);
  }

  return reply;
}

async function generateLessonChatReply({ question, subject = '', lesson = {}, extractedText = '', history = [] }) {
  const recentHistory = normalizeChatHistory(history);
  const conversationText = recentHistory.length
    ? recentHistory
        .map((message) => `${message.role === 'assistant' ? 'Tutor' : 'Student'}: ${message.content}`)
        .join('\n\n')
    : 'No previous conversation.';

  const lessonContext = truncateText(JSON.stringify(lesson, null, 2), 4000) || '{}';
  const sourceContext = truncateText(extractedText, 1200) || 'No source text provided.';
  const safeQuestion = truncateText(question, 800);

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

  return generateTextResponse(prompt, 'lesson chat', CHAT_MODEL);
}

function getRequestBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }

  return req.body;
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = getRequestBody(req);
    const question = typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) {
      return res.status(400).json({ error: 'Please enter a question.' });
    }

    const reply = await generateLessonChatReply({
      question,
      subject: typeof body.subject === 'string' ? body.subject.trim() : '',
      lesson: body.lesson,
      extractedText: typeof body.extractedText === 'string' ? body.extractedText : '',
      history: body.history
    });

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Lesson chat error:', error);
    return res.status(500).json({ error: error.message || 'Failed to answer question' });
  }
};
