import React from 'react';
import './QuizReview.css';

const QuizReview = ({ quizRecord, onBack }) => {
  const { questions = [], userAnswers = {}, score, subject, timestamp } = quizRecord;

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const normalizeText = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const isQuestionCorrect = (question, userAnswer) => {
    const questionType = question.type || 'multiple_choice';

    if (questionType === 'short_answer') {
      const acceptable =
        Array.isArray(question.acceptableAnswers) && question.acceptableAnswers.length
          ? question.acceptableAnswers
          : question.correctAnswer
            ? [question.correctAnswer]
            : [];

      const normalizedUser = normalizeText(userAnswer);
      if (!normalizedUser) return false;
      return acceptable.some((a) => normalizeText(a) === normalizedUser);
    }

    return userAnswer === question.correctAnswer;
  };

  return (
    <div className="quiz-review">
      <div className="review-header-section">
        <button onClick={onBack} className="back-button">← Back to Past Quizzes</button>
        <div className="review-title-section">
          <h2>Quiz Review</h2>
          <div className="review-meta">
            <span className="review-subject">{subject}</span>
            <span className="review-date">{formatDate(timestamp)}</span>
          </div>
        </div>
      </div>

      <div className={`review-score-card ${score.percentage >= 70 ? 'passing' : 'failing'}`}>
        <div className="review-score-circle">
          <div className="review-score-value">{score.percentage}%</div>
          <div className="review-score-label">Score</div>
        </div>
        <div className="review-score-details">
          <p className="review-score-text">
            You got <strong>{score.correct}</strong> out of <strong>{score.total}</strong> questions correct!
          </p>
        </div>
      </div>

      <div className="review-questions-section">
        <h3>Question Review</h3>
        {questions.map((question, index) => {
          const userAnswer = userAnswers[index];
          const isCorrect = isQuestionCorrect(question, userAnswer);
          const optionLabel = (idx) => String.fromCharCode(65 + idx);
          const questionType = question.type || 'multiple_choice';

          return (
            <div key={index} className={`review-question-item ${isCorrect ? 'correct' : 'incorrect'}`}>
              <div className="review-question-header">
                <span className="review-question-number">Question {index + 1}</span>
                <span className={`review-status-badge ${isCorrect ? 'correct-badge' : 'incorrect-badge'}`}>
                  {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                </span>
              </div>
              
              <p className="review-question-text">{question.question}</p>

              {questionType === 'short_answer' ? (
                <div className="short-answer-review">
                  <div className="short-answer-row">
                    <span className="short-answer-label">Your answer:</span>
                    <span
                      className={`short-answer-value ${isCorrect ? 'short-answer-correct' : 'short-answer-incorrect'}`}
                    >
                      {typeof userAnswer === 'string' && userAnswer.trim() ? userAnswer : '—'}
                    </span>
                  </div>
                  <div className="short-answer-row">
                    <span className="short-answer-label">Correct answer:</span>
                    <span className="short-answer-value">
                      {Array.isArray(question.acceptableAnswers) && question.acceptableAnswers.length
                        ? question.acceptableAnswers[0]
                        : question.correctAnswer ?? '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="review-options-list">
                  {(question.options || []).map((option, optIndex) => {
                    let optionClass = 'review-option-item';
                    let label = '';

                    if (optIndex === question.correctAnswer) {
                      optionClass += ' correct-answer';
                      label = '✓ Correct Answer';
                    } else if (optIndex === userAnswer && !isCorrect) {
                      optionClass += ' user-answer';
                      label = 'Your Answer';
                    }

                    return (
                      <div key={optIndex} className={optionClass}>
                        <span className="review-option-label">{optionLabel(optIndex)}</span>
                        <span className="review-option-text">{option}</span>
                        {label && <span className="review-option-badge">{label}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QuizReview;


