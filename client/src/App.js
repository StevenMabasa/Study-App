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

    const isQuestionCorrect = (question, userAnswer) => {
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

  const currentQuizQuestionCount = quiz?.questions?.length || 0;
  const currentLessonSectionCount = lesson?.lesson?.sections?.length || 0;
  const currentLessonObjectiveCount = lesson?.lesson?.learningObjectives?.length || 0;

  const viewContent = {
    upload: {
      eyebrow: 'AI Study Studio',
      title: 'Turn lecture slides into a study session that feels clear, guided, and motivating.',
      description:
        'Upload your notes once, choose whether you want a lesson or a quiz, and keep the experience focused from first upload to final review.',
      status: 'Ready for a new study session',
      stats: [
        { value: '2', label: 'study modes' },
        { value: '1 upload', label: 'to get started' },
        { value: 'Tutor chat', label: 'inside lessons' }
      ]
    },
    quiz: {
      eyebrow: 'Quiz Mode',
      title: 'Practice one question at a time with a cleaner, calmer focus.',
      description:
        'Your quiz session keeps progress visible, reduces clutter, and makes it easy to move through the material without losing momentum.',
      status: `Quiz ready in ${quiz?.subject || 'your subject'}`,
      stats: [
        { value: String(currentQuizQuestionCount || 0), label: 'questions loaded' },
        { value: quiz?.subject || 'Custom', label: 'subject' },
        { value: 'Instant', label: 'scoring and review' }
      ]
    },
    lesson: {
      eyebrow: 'Lesson Mode',
      title: 'Learn the material in plain language before you test yourself on it.',
      description:
        'The lesson view breaks complex slide content into guided sections, examples, study tips, and an interactive chat for follow-up questions.',
      status: `Lesson ready for ${lesson?.subject || 'your material'}`,
      stats: [
        { value: String(currentLessonSectionCount || 0), label: 'lesson sections' },
        { value: String(currentLessonObjectiveCount || 0), label: 'learning goals' },
        { value: 'Interactive', label: 'follow-up tutoring' }
      ]
    },
    results: {
      eyebrow: 'Results',
      title: 'See what stuck, what needs work, and where to focus next.',
      description:
        'Your results screen surfaces the score quickly, then lets you review each answer with enough clarity to study from the mistakes.',
      status: `Results for ${quiz?.subject || 'your quiz'}`,
      stats: [
        { value: String(currentQuizQuestionCount || 0), label: 'questions reviewed' },
        { value: String(Object.keys(userAnswers || {}).length), label: 'responses captured' },
        { value: 'Saved', label: 'to quiz history' }
      ]
    },
    past: {
      eyebrow: 'History',
      title: 'Keep past quizzes within reach so revision feels organized, not scattered.',
      description:
        'Filter by subject, sort by score or date, and jump back into any previous quiz review whenever you need a quick refresher.',
      status: 'Browsing saved quiz history',
      stats: [
        { value: 'History', label: 'saved automatically' },
        { value: 'Filter', label: 'by subject' },
        { value: 'Review', label: 'every question again' }
      ]
    },
    review: {
      eyebrow: 'Review',
      title: 'Revisit one quiz in detail and learn from each response.',
      description:
        'This view makes it easy to look back over a completed quiz, compare your answers, and spot exactly where understanding slipped.',
      status: `Reviewing ${reviewQuiz?.subject || 'a saved quiz'}`,
      stats: [
        { value: `${reviewQuiz?.score?.percentage ?? 0}%`, label: 'saved score' },
        { value: String(reviewQuiz?.questions?.length || 0), label: 'questions in review' },
        { value: reviewQuiz?.subject || 'Saved quiz', label: 'subject' }
      ]
    }
  };

  const activeView = viewContent[currentView] || viewContent.upload;
  const heroTags = ['Multiple-choice quizzes', 'Guided lessons', 'Interactive tutor'];

  let renderedContent = <FileUpload onContentGenerated={handleStudyContentGenerated} />;

  if (currentView === 'quiz' && quiz && !showResults) {
    renderedContent = (
      <Quiz
        subject={quiz.subject}
        questions={quiz.questions}
        metadata={quiz.metadata}
        onComplete={handleQuizComplete}
        onReset={handleReset}
      />
    );
  }

  if (currentView === 'lesson' && lesson) {
    renderedContent = <Lesson lesson={lesson} onReset={handleReset} />;
  }

  if (currentView === 'results' && quiz && showResults) {
    renderedContent = (
      <Results
        quiz={quiz}
        userAnswers={userAnswers}
        onReset={handleReset}
        onViewPast={handleViewPastQuizzes}
      />
    );
  }

  if (currentView === 'past') {
    renderedContent = <PastQuizzes onReviewQuiz={handleReviewQuiz} />;
  }

  if (currentView === 'review' && reviewQuiz) {
    renderedContent = <QuizReview quizRecord={reviewQuiz} onBack={handleBackToPast} />;
  }

  return (
    <div className="App">
      <div className="container">
        <header className="app-hero">
          <div className="app-hero-copy">
            <div className="hero-eyebrow">{activeView.eyebrow}</div>
            <h1>{activeView.title}</h1>
            <p>{activeView.description}</p>

            <div className="hero-tags">
              {heroTags.map((tag) => (
                <span key={tag} className="hero-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <aside className="hero-panel">
            <div className="hero-panel-header">
              <span className="hero-panel-label">Current Focus</span>
              <strong>{activeView.status}</strong>
            </div>

            <div className="hero-stats">
              {activeView.stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`} className="hero-stat-card">
                  <span className="hero-stat-value">{stat.value}</span>
                  <span className="hero-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
          </aside>
        </header>

        <div className="shell-toolbar">
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

          <div className="view-indicator">
            <span className="view-indicator-label">Current view</span>
            <strong>{activeView.status}</strong>
          </div>
        </div>

        <main className={`content-frame content-frame-${currentView}`}>{renderedContent}</main>
      </div>
    </div>
  );
}

export default App;
