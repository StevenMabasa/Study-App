const TRUE_FALSE_OPTIONS = ['True', 'False'];

export const getQuestionOptions = (question, index) => {
  const questionType = String(question?.type || '').toLowerCase();

  if (questionType === 'true_false' || index >= 15) {
    return TRUE_FALSE_OPTIONS;
  }

  return Array.isArray(question?.options)
    ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
};
