const TRUE_FALSE_OPTIONS = ['True', 'False'];
export const TRUE_FALSE_START_INDEX = 10;

export const getQuestionOptions = (question, index) => {
  const questionType = String(question?.type || '').toLowerCase();

  if (questionType === 'true_false' || index >= TRUE_FALSE_START_INDEX) {
    return TRUE_FALSE_OPTIONS;
  }

  return Array.isArray(question?.options)
    ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
};
