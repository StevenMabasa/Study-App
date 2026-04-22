import React, { useState } from 'react';
import './App.css';
import FileUpload from './components/FileUpload';
import Quiz from './components/Quiz';
import Results from './components/Results';
import PastQuizzes from './components/PastQuizzes';
import QuizReview from './components/QuizReview';
import Lesson from './components/Lesson';
import { saveQuiz } from './utils/quizStorage';

function App() {
  const [quiz, setQuiz] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [userAnswers, setUserAnswers] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [currentView, setCurrentView] = useState('upload');
  const [reviewQuiz, setReviewQuiz] = useState(null);

  const handleStudyContentGenerated = (contentPackage) => {
    setUserAnswers(null);
    setShowResults(false);
    setReviewQuiz(null);

    if (contentPackage.mode === 'lesson') {
      setLesson(contentPackage);
      setQuiz(null);
      setCurrentView('lesson');
      return;
    }

    setQuiz(contentPackage);
    setLesson(null);
    setCurrentView('quiz');
  };

  const handleQuizComplete = (answers) => {
    setUserAnswers(answers);
    setShowResults(true);
    setCurrentView('results');

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
        return acceptable.some((answer) => normalizeText(answer) === normalizedUser);
      }

      return userAnswer === question.correctAnswer;
    };

    let correct = 0;
    quiz.questions.forEach((question, index) => {
      if (isQuestionCorrect(question, answers[index])) {
        correct++;
      }
    });

    const totalQuestions = quiz.questions.length || 1;
    const score = {
      correct,
      total: totalQuestions,
      percentage: Math.round((correct / totalQuestions) * 100)
    };

    saveQuiz(quiz, answers, score);
  };

  const handleReset = () => {
    setQuiz(null);
    setLesson(null);
    setUserAnswers(null);
    setShowResults(false);
    setReviewQuiz(null);
    setCurrentView('upload');
  };

  const handleViewPastQuizzes = () => {
    setCurrentView('past');
  };

  const handleReviewQuiz = (quizRecord) => {
    setReviewQuiz(quizRecord);
    setCurrentView('review');
  };

  const handleBackToPast = () => {
    setCurrentView('past');
    setReviewQuiz(null);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>Study App</h1>
          <p>Upload your lecture slides or notes, then choose a quiz or a guided lesson.</p>
        </header>

        <nav className="main-nav">
          <button
            className={`nav-tab ${currentView === 'upload' ? 'active' : ''}`}
            onClick={handleReset}
          >
            New Study Session
          </button>
          <button
            className={`nav-tab ${currentView === 'past' ? 'active' : ''}`}
            onClick={handleViewPastQuizzes}
          >
            Past Quizzes
          </button>
        </nav>

        {currentView === 'upload' && (
          <FileUpload onContentGenerated={handleStudyContentGenerated} />
        )}

        {currentView === 'quiz' && quiz && !showResults && (
          <Quiz
            subject={quiz.subject}
            questions={quiz.questions}
            metadata={quiz.metadata}
            onComplete={handleQuizComplete}
            onReset={handleReset}
          />
        )}

        {currentView === 'lesson' && lesson && (
          <Lesson lesson={lesson} onReset={handleReset} />
        )}

        {currentView === 'results' && quiz && showResults && (
          <Results
            quiz={quiz}
            userAnswers={userAnswers}
            onReset={handleReset}
            onViewPast={handleViewPastQuizzes}
          />
        )}

        {currentView === 'past' && (
          <PastQuizzes onReviewQuiz={handleReviewQuiz} />
        )}

        {currentView === 'review' && reviewQuiz && (
          <QuizReview quizRecord={reviewQuiz} onBack={handleBackToPast} />
        )}
      </div>
    </div>
  );
}

export default App;
