type Props = {
  open: boolean;
  items: number;
  tokens: number;
  cost: number;
  costIls?: number;
  lang: string;
  loading?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  warning?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TranslationConfirmModal(props: Props) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="translations-modal-overlay" role="presentation">
      <div className="translations-modal" role="dialog" aria-modal="true">
        <h3 className="translations-modal__title">{props.title ?? "Confirm Translation Run"}</h3>
        <p className="translations-modal__text">
          {props.description ?? "You are about to start a manual translation batch."}
        </p>
        <ul className="translations-modal__list">
          <li>Items: {props.items}</li>
          <li>Estimated tokens: {props.tokens.toLocaleString()}</li>
          <li>Estimated cost: ${props.cost.toFixed(4)}</li>
          {typeof props.costIls === "number" && <li>Estimated cost: ₪{props.costIls.toFixed(3)}</li>}
          <li>Target language: {props.lang}</li>
        </ul>
        {props.warning && (
          <div className="translations-alert translations-alert--error" style={{ marginTop: 0, marginBottom: 16 }}>
            {props.warning}
          </div>
        )}
        <div className="translations-modal__actions">
          <button
            className="translations-button translations-button--secondary"
            onClick={props.onCancel}
            disabled={props.loading}
          >
            Cancel
          </button>
          <button
            className="translations-button translations-button--primary"
            onClick={props.onConfirm}
            disabled={props.loading}
          >
            {props.loading ? "Starting..." : (props.confirmLabel ?? "Confirm & Start")}
          </button>
        </div>
      </div>
    </div>
  );
}
