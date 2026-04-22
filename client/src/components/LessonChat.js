import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './LessonChat.css';

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

function buildIntroMessage(lesson) {
  const title = lesson?.lesson?.title || lesson?.subject || 'this lesson';
  return {
    id: 'intro',
    role: 'assistant',
    content: `Ask me anything about ${title}. I can explain difficult ideas, break concepts into smaller steps, or give more examples.`
  };
}

const LessonChat = ({ lesson }) => {
  const [messages, setMessages] = useState(() => [buildIntroMessage(lesson)]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const lessonData = lesson?.lesson || {};
  const sections = Array.isArray(lessonData.sections) ? lessonData.sections : [];
  const starterPrompts = [
    sections[0]?.heading ? `Explain "${sections[0].heading}" in simpler terms.` : 'Explain this lesson in simpler terms.',
    'What are the three most important things I should remember?',
    'Give me an example to help me understand this better.'
  ].filter(Boolean);

  useEffect(() => {
    setMessages([buildIntroMessage(lesson)]);
    setDraft('');
    setError('');
    setIsSending(false);
  }, [lesson]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const sendQuestion = async (nextQuestion) => {
    const question = String(nextQuestion || draft).trim();

    if (!question || isSending) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question
    };

    const nextHistory = [...messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setIsSending(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/lesson-chat`, {
        question,
        subject: lesson?.subject || '',
        lesson: lessonData,
        extractedText: lesson?.extractedText || '',
        history: nextHistory
      });

      const reply = String(response.data?.reply || '').trim() || 'I could not generate a reply just yet.';

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply
        }
      ]);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'I ran into a problem answering that question. Please try again.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendQuestion();
  };

  const handleKeyDown = async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await sendQuestion();
    }
  };

  return (
    <section className="lesson-chat">
      <div className="lesson-chat-header">
        <div>
          <div className="lesson-chat-kicker">Interactive Help</div>
          <h3>Ask The Lesson</h3>
          <p>Use the chat to ask follow-up questions or request a simpler explanation.</p>
        </div>
      </div>

      <div className="lesson-chat-starters">
        {starterPrompts.map((prompt, index) => (
          <button
            key={`${prompt}-${index}`}
            type="button"
            className="lesson-chat-starter"
            onClick={() => sendQuestion(prompt)}
            disabled={isSending}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="lesson-chat-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`lesson-chat-message ${message.role === 'assistant' ? 'assistant' : 'user'}`}
          >
            <div className="lesson-chat-message-role">
              {message.role === 'assistant' ? 'Tutor' : 'You'}
            </div>
            <div className="lesson-chat-message-content">{message.content}</div>
          </div>
        ))}

        {isSending && (
          <div className="lesson-chat-message assistant">
            <div className="lesson-chat-message-role">Tutor</div>
            <div className="lesson-chat-message-content lesson-chat-thinking">
              Thinking through your question...
            </div>
          </div>
        )}

        <div ref={endRef}></div>
      </div>

      {error && <div className="lesson-chat-error">{error}</div>}

      <form className="lesson-chat-form" onSubmit={handleSubmit}>
        <textarea
          className="lesson-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for more explanation, another example, or help with something confusing..."
          rows={4}
          disabled={isSending}
        />

        <div className="lesson-chat-actions">
          <span className="lesson-chat-hint">Press Enter to send, Shift + Enter for a new line.</span>
          <button
            type="submit"
            className="lesson-chat-send"
            disabled={isSending || !draft.trim()}
          >
            {isSending ? 'Sending...' : 'Send Question'}
          </button>
        </div>
      </form>
    </section>
  );
};

export default LessonChat;
