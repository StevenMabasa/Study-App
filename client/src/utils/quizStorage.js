// Utility functions for managing quizzes in localStorage

export const saveQuiz = (quizData, userAnswers, score) => {
  const quizRecord = {
    id: Date.now().toString(),
    subject: quizData.subject || 'General',
    questions: Array.isArray(quizData.questions) ? quizData.questions : [],
    metadata: quizData.metadata || {},
    userAnswers,
    score,
    timestamp: new Date().toISOString()
  };

  // Get existing quizzes
  const savedQuizzes = getSavedQuizzes();
  
  // Add new quiz
  savedQuizzes.push(quizRecord);
  
  // Save back to localStorage
  localStorage.setItem('studyAppQuizzes', JSON.stringify(savedQuizzes));
  
  return quizRecord;
};

export const getSavedQuizzes = () => {
  const quizzes = localStorage.getItem('studyAppQuizzes');
  return quizzes ? JSON.parse(quizzes) : [];
};

export const getQuizzesBySubject = (subject) => {
  const allQuizzes = getSavedQuizzes();
  return allQuizzes.filter(quiz => quiz.subject === subject);
};

export const getAllSubjects = () => {
  const allQuizzes = getSavedQuizzes();
  const subjects = [...new Set(allQuizzes.map(quiz => quiz.subject).filter(Boolean))];
  return subjects.sort((a, b) => a.localeCompare(b));
};

export const getQuizById = (id) => {
  const allQuizzes = getSavedQuizzes();
  return allQuizzes.find(quiz => quiz.id === id);
};

export const deleteQuiz = (id) => {
  const allQuizzes = getSavedQuizzes();
  const filtered = allQuizzes.filter(quiz => quiz.id !== id);
  localStorage.setItem('studyAppQuizzes', JSON.stringify(filtered));
};

export const deleteQuizzesBySubject = (subject) => {
  const allQuizzes = getSavedQuizzes();
  const filtered = allQuizzes.filter(quiz => quiz.subject !== subject);
  localStorage.setItem('studyAppQuizzes', JSON.stringify(filtered));
};


