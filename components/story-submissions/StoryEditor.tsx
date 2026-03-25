import { StepEditor } from "./StepEditor";
import type { StorySubmission } from "../../lib/story-submissions/types";

type StoryEditorProps = {
  submission: StorySubmission | null;
  busy: boolean;
  onChange: (next: StorySubmission) => void;
  onSave: () => Promise<void>;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
};

export function StoryEditor({
  submission,
  busy,
  onChange,
  onSave,
  onApprove,
  onReject,
}: StoryEditorProps) {
  if (!submission) {
    return (
      <section className="story-submission-editor story-submission-editor--empty">
        <h2>Выбери историю слева</h2>
        <p>Здесь откроется полный текст заявки: герой, шесть шагов сюжета и заметки ревьюера.</p>
      </section>
    );
  }

  return (
    <section className="story-submission-editor">
      <header className="story-submission-editor__head">
        <div>
          <h1 className="books-admin-title">Модерация истории</h1>
          <p className="books-admin-subtitle">
            Редактируй историю как готовый рассказ, без choice_id и fragment_id.
          </p>
        </div>

        <div className="books-actions">
          <button type="button" className="books-button books-button--secondary" disabled={busy} onClick={() => void onSave()}>
            Save edits
          </button>
          <button type="button" className="books-button books-button--success" disabled={busy} onClick={() => void onApprove()}>
            Approve
          </button>
          <button type="button" className="books-button books-button--delete" disabled={busy} onClick={() => void onReject()}>
            Reject
          </button>
        </div>
      </header>

      <div className="story-submission-meta">
        <label className="books-field">
          <span className="books-field__label">Главный герой</span>
          <input
            className="books-input"
            value={submission.heroName}
            onChange={(event) => onChange({ ...submission, heroName: event.target.value })}
            placeholder="Имя героя"
          />
        </label>

        <div className="story-submission-mode">
          <span className="story-submission-mode__label">Режим</span>
          <strong>{submission.mode.trim() || "Без режима"}</strong>
        </div>
      </div>

      <div className="story-submission-steps">
        {submission.assembledStory.steps.map((step) => (
          <StepEditor
            key={step.key}
            step={step}
            onChange={(nextStep) =>
              onChange({
                ...submission,
                assembledStory: {
                  steps: submission.assembledStory.steps.map((item) =>
                    item.key === nextStep.key ? nextStep : item,
                  ),
                },
                slides: submission.slides.some((slide) => slide.stepKey === nextStep.key)
                  ? nextStep.slideMediaUrl.trim()
                    ? submission.slides.map((slide) =>
                        slide.stepKey === nextStep.key
                          ? { ...slide, mediaUrl: nextStep.slideMediaUrl }
                          : slide,
                      )
                    : submission.slides.filter((slide) => slide.stepKey !== nextStep.key)
                  : nextStep.slideMediaUrl.trim()
                    ? [...submission.slides, { stepKey: nextStep.key, mediaUrl: nextStep.slideMediaUrl }]
                    : submission.slides,
              })
            }
          />
        ))}
      </div>

      <label className="books-field">
        <span className="books-field__label">Заметки ревьюера</span>
        <textarea
          className="books-input books-input--textarea"
          value={submission.reviewerNotes}
          onChange={(event) => onChange({ ...submission, reviewerNotes: event.target.value })}
          placeholder="Что исправлено, что проверить ещё, почему история одобрена или отклонена"
        />
      </label>
    </section>
  );
}
