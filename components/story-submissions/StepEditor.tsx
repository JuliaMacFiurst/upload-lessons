import type { StorySubmissionStep } from "../../lib/story-submissions/types";

type StepEditorProps = {
  step: StorySubmissionStep;
  onChange: (next: StorySubmissionStep) => void;
};

function parseKeywords(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function StepEditor({ step, onChange }: StepEditorProps) {
  return (
    <section className="story-submission-step">
      <div className="story-submission-step__head">
        <div>
          <h3 className="story-submission-step__title">{step.label}</h3>
          <p className="story-submission-step__help">
            Fragments здесь не нужны: редактируется уже собранный линейный текст шага.
          </p>
        </div>
      </div>

      <label className="books-field">
        <span className="books-field__label">Текст шага</span>
        <textarea
          className="books-input books-input--textarea"
          value={step.text}
          onChange={(event) => onChange({ ...step, text: event.target.value })}
          placeholder="Текст этого фрагмента истории"
        />
      </label>

      <label className="books-field">
        <span className="books-field__label">Ключевые слова</span>
        <input
          className="books-input"
          value={step.keywords.join(", ")}
          onChange={(event) => onChange({ ...step, keywords: parseKeywords(event.target.value) })}
          placeholder="например: лес, ночь, фонарь"
        />
      </label>

      <label className="books-field">
        <span className="books-field__label">Media URL слайда</span>
        <input
          className="books-input"
          value={step.slideMediaUrl}
          onChange={(event) => onChange({ ...step, slideMediaUrl: event.target.value })}
          placeholder="https://..."
        />
      </label>

      {step.preview?.trim() ? (
        <div className="story-submission-preview">
          <span className="story-submission-preview__label">Предпросмотр</span>
          <p>{step.preview}</p>
        </div>
      ) : null}
    </section>
  );
}
