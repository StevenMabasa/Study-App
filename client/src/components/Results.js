import React from 'react';
import './Results.css';

const Results = ({ quiz, userAnswers, onReset, onViewPast }) => {
  const questions = quiz?.questions || [];
  const answers = userAnswers || {};

  const isQuestionCorrect = (question, userAnswer) => {
    return userAnswer === question.correctAnswer;
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((question, index) => {
      if (isQuestionCorrect(question, answers[index])) {
        correct++;
      }
    });
    const total = questions.length || 1;
    return { correct, total, percentage: Math.round((correct / total) * 100) };
  };

  const score = calculateScore();
  const isPassing = score.percentage >= 70;

  return (
    <div className="results">
      <div className="results-header">
        <h2>Quiz Results</h2>
        <button onClick={onReset} className="new-quiz-button">New Quiz</button>
      </div>

      {(quiz.subject || quiz.metadata?.fileName) && (
        <div className="results-meta">
          {quiz.subject && <span className="results-subject">Subject: {quiz.subject}</span>}
          {quiz.metadata?.fileName && <span className="results-file">Source: {quiz.metadata.fileName}</span>}
        </div>
      )}

      <div className={`score-card ${isPassing ? 'passing' : 'failing'}`}>
        <div className="score-circle">
          <div className="score-value">{score.percentage}%</div>
          <div className="score-label">Score</div>
        </div>
        <div className="score-details">
          <p className="score-text">
            You got <strong>{score.correct}</strong> out of <strong>{score.total}</strong> questions correct!
          </p>
          {isPassing ? (
            <p className="score-message passing-message">Great job. Keep up the good work!</p>
          ) : (
            <p className="score-message failing-message">Keep studying. Review the answers below.</p>
          )}
        </div>
      </div>

      <div className="questions-review">
        <h3>Question Review</h3>
        {questions.map((question, index) => {
          const userAnswer = answers[index];
          const isCorrect = isQuestionCorrect(question, userAnswer);
          const optionLabel = (idx) => String.fromCharCode(65 + idx);
          const options = Array.isArray(question.options) ? question.options : [];

          return (
            <div key={index} className={`review-item ${isCorrect ? 'correct' : 'incorrect'}`}>
              <div className="review-header">
                <span className="question-number">Question {index + 1}</span>
                <span className={`status-badge ${isCorrect ? 'correct-badge' : 'incorrect-badge'}`}>
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </span>
              </div>

              <p className="review-question">{question.question}</p>

              <div className="review-answers">
                {options.map((option, optIndex) => {
                  let optionClass = 'review-option';
                  let label = '';

                  if (optIndex === question.correctAnswer) {
                    optionClass += ' correct-answer';
                    label = 'Correct Answer';
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
            </div>
          );
        })}
      </div>

      <div className="results-footer">
        <button onClick={onReset} className="retake-button secondary">
          Generate New Quiz
        </button>
        {onViewPast && (
          <button onClick={onViewPast} className="retake-button">
            View Past Quizzes
          </button>
        )}
      </div>
    </div>
  );
};

export default Results;
