import React, { useState } from 'react';
import './Quiz.css';

const Quiz = ({ questions = [], subject, onComplete, onReset }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});

  const handleOptionSelect = (optionIndex) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion]: optionIndex
    }));
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      onComplete(answers);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = () => {
    onComplete(answers);
  };

  const question = questions[currentQuestion] || { options: [] };
  const totalQuestions = questions.length || 1;
  const progress = ((currentQuestion + 1) / totalQuestions) * 100;
  const answeredQuestions = questions.reduce((acc, _question, idx) => {
    const userAnswer = answers[idx];
    return userAnswer !== undefined && userAnswer !== null ? acc + 1 : acc;
  }, 0);

  const currentAnswer = answers[currentQuestion];
  const options = Array.isArray(question.options) ? question.options : [];

  return (
    <div className="quiz">
      <div className="quiz-header">
        <button onClick={onReset} className="reset-button">New Quiz</button>
        <div className="progress-info">
          <span>Question {currentQuestion + 1} of {totalQuestions}</span>
          <span className="answered-count">{answeredQuestions} answered</span>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="question-card">
        {subject && <div className="question-subject">Subject: {subject}</div>}
        <h2 className="question-text">{question.question}</h2>

        <div className="options">
          {options.map((option, index) => {
            const optionLabel = String.fromCharCode(65 + index);
            const isSelected = currentAnswer === index;
            return (
              <button
                key={index}
                className={`option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleOptionSelect(index)}
              >
                <span className="option-label">{optionLabel}</span>
                <span className="option-text">{option}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="quiz-navigation">
        <button
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
          className="nav-button prev-button"
        >
          Previous
        </button>

        {currentQuestion === totalQuestions - 1 ? (
          <button
            onClick={handleSubmit}
            className="nav-button submit-button"
          >
            Submit Quiz
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="nav-button next-button"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
};

export default Quiz;
