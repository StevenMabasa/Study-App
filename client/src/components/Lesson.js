import React from 'react';
import LessonChat from './LessonChat';
import './Lesson.css';

const Lesson = ({ lesson, onReset }) => {
  const lessonData = lesson?.lesson || {};
  const learningObjectives = Array.isArray(lessonData.learningObjectives)
    ? lessonData.learningObjectives
    : [];
  const sections = Array.isArray(lessonData.sections) ? lessonData.sections : [];
  const studyTips = Array.isArray(lessonData.studyTips) ? lessonData.studyTips : [];
  const possibleMisconceptions = Array.isArray(lessonData.possibleMisconceptions)
    ? lessonData.possibleMisconceptions
    : [];
  const lessonHighlights = [
    { value: sections.length, label: 'sections' },
    { value: learningObjectives.length, label: 'learning goals' },
    { value: studyTips.length, label: 'study tips' }
  ].filter((item) => item.value > 0);
  const showLessonSidebar = lessonHighlights.length > 0 || Boolean(lessonData.summary);

  return (
    <div className="lesson">
      <section className="lesson-hero">
        <div className="lesson-header">
          <div>
            <div className="lesson-kicker">Guided Lesson</div>
            <h2>{lessonData.title || lesson.subject || 'Your Lesson'}</h2>
            {(lesson.subject || lesson.metadata?.fileName) && (
              <div className="lesson-meta">
                {lesson.subject && <span>Subject: {lesson.subject}</span>}
                {lesson.metadata?.fileName && <span>Source: {lesson.metadata.fileName}</span>}
              </div>
            )}
          </div>

          <button type="button" onClick={onReset} className="lesson-reset-button">
            New Upload
          </button>
        </div>

        <div className={`lesson-hero-grid ${!lessonData.overview ? 'single-column' : ''}`}>
          {lessonData.overview && (
            <section className="lesson-card lesson-overview">
              <h3>Overview</h3>
              <p>{lessonData.overview}</p>
            </section>
          )}

          {showLessonSidebar && (
            <aside className="lesson-hero-sidebar">
              {lessonHighlights.map((item) => (
                <div key={item.label} className="lesson-highlight-card">
                  <span className="lesson-highlight-value">{item.value}</span>
                  <span className="lesson-highlight-label">{item.label}</span>
                </div>
              ))}

              {lessonData.summary && (
                <div className="lesson-hero-summary">
                  <span className="lesson-hero-summary-label">Takeaway</span>
                  <p>{lessonData.summary}</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </section>

      {learningObjectives.length > 0 && (
        <section className="lesson-card lesson-focus-card">
          <h3>What You Should Understand</h3>
          <ul className="lesson-list">
            {learningObjectives.map((objective, index) => (
              <li key={`${objective}-${index}`}>{objective}</li>
            ))}
          </ul>
        </section>
      )}

      {sections.length > 0 && (
        <section className="lesson-section-block">
          <div className="lesson-section-header">
            <div>
              <div className="lesson-section-kicker">Lesson walkthrough</div>
              <h3>Learn the material step by step</h3>
            </div>
            <p>
              Each section explains the lecture content in plain language and gives you a way to
              check your understanding before moving on.
            </p>
          </div>

          <div className="lesson-sections">
            {sections.map((section, index) => {
              const keyPoints = Array.isArray(section.keyPoints) ? section.keyPoints : [];
              const reflectionQuestions = Array.isArray(section.checkYourUnderstanding)
                ? section.checkYourUnderstanding
                : [];

              return (
                <article
                  key={`${section.heading || 'section'}-${index}`}
                  className="lesson-card lesson-section"
                >
                  <div className="lesson-section-number">Part {index + 1}</div>
                  <h3>{section.heading || `Section ${index + 1}`}</h3>

                  {section.explanation && <p className="lesson-explanation">{section.explanation}</p>}

                  {keyPoints.length > 0 && (
                    <div className="lesson-subsection">
                      <h4>Key Points</h4>
                      <ul className="lesson-list">
                        {keyPoints.map((point, pointIndex) => (
                          <li key={`${point}-${pointIndex}`}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {section.example && (
                    <div className="lesson-subsection lesson-example">
                      <h4>Example</h4>
                      <p>{section.example}</p>
                    </div>
                  )}

                  {reflectionQuestions.length > 0 && (
                    <div className="lesson-subsection">
                      <h4>Check Your Understanding</h4>
                      <ul className="lesson-list">
                        {reflectionQuestions.map((question, questionIndex) => (
                          <li key={`${question}-${questionIndex}`}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="lesson-grid">
        {lessonData.summary && !lessonData.overview && (
          <section className="lesson-card">
            <h3>Lesson Summary</h3>
            <p>{lessonData.summary}</p>
          </section>
        )}

        {studyTips.length > 0 && (
          <section className="lesson-card">
            <h3>Study Tips</h3>
            <ul className="lesson-list">
              {studyTips.map((tip, index) => (
                <li key={`${tip}-${index}`}>{tip}</li>
              ))}
            </ul>
          </section>
        )}

        {possibleMisconceptions.length > 0 && (
          <section className="lesson-card">
            <h3>Watch Out For These Mistakes</h3>
            <ul className="lesson-list">
              {possibleMisconceptions.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <LessonChat lesson={lesson} />
    </div>
  );
};

export default Lesson;
