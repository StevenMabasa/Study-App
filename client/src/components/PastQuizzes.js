import React, { useState, useEffect } from 'react';
import { getSavedQuizzes, getAllSubjects, deleteQuiz } from '../utils/quizStorage';
import './PastQuizzes.css';

const PastQuizzes = ({ onReviewQuiz }) => {
  const [quizzes, setQuizzes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    loadQuizzes();
  }, [selectedSubject, sortBy]);

  const loadQuizzes = () => {
    let allQuizzes = getSavedQuizzes();
    const allSubjects = getAllSubjects();
    setSubjects(allSubjects);

    // Filter by subject
    if (selectedSubject !== 'all') {
      allQuizzes = allQuizzes.filter(quiz => quiz.subject === selectedSubject);
    }

    // Sort
    allQuizzes.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.timestamp) - new Date(a.timestamp);
      } else if (sortBy === 'oldest') {
        return new Date(a.timestamp) - new Date(b.timestamp);
      } else if (sortBy === 'score') {
        return b.score.percentage - a.score.percentage;
      }
      return 0;
    });

    setQuizzes(allQuizzes);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this quiz?')) {
      deleteQuiz(id);
      loadQuizzes();
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="past-quizzes">
      <div className="past-quizzes-header">
        <h2>Past Quizzes</h2>
        {quizzes.length > 0 && (
          <div className="filters">
            <select 
              value={selectedSubject} 
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Subjects</option>
              {subjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="filter-select"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="score">Highest Score</option>
            </select>
          </div>
        )}
      </div>

      {quizzes.length === 0 ? (
        <div className="no-quizzes">
          <div className="no-quizzes-icon">📝</div>
          <h3>No quizzes yet</h3>
          <p>Complete a quiz to see it here!</p>
        </div>
      ) : (
        <div className="quizzes-grid">
          {quizzes.map((quizRecord) => {
            const score = quizRecord.score || { percentage: 0, correct: 0, total: quizRecord.questions?.length || 0 };
            return (
              <div 
                key={quizRecord.id} 
                className="quiz-card"
                onClick={() => onReviewQuiz(quizRecord)}
              >
                <div className="quiz-card-header">
                  <span className="quiz-subject">{quizRecord.subject || 'General'}</span>
                  <button 
                    className="delete-quiz-btn"
                    onClick={(e) => handleDelete(quizRecord.id, e)}
                    title="Delete quiz"
                  >
                    ×
                  </button>
                </div>
                <div className="quiz-card-score">
                  <div className={`score-badge ${score.percentage >= 70 ? 'pass' : 'fail'}`}>
                    {score.percentage}%
                  </div>
                  <div className="score-details">
                    <span>{score.correct}/{score.total} correct</span>
                  </div>
                </div>
                <div className="quiz-card-meta">
                  <span className="quiz-date">{formatDate(quizRecord.timestamp)}</span>
                  <span className="quiz-questions">{quizRecord.questions?.length || 0} questions</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PastQuizzes;


