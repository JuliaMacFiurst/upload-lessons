type Props = {
  open: boolean;
  items: number;
  tokens: number;
  cost: number;
  lang: string;
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
        <h3 className="translations-modal__title">Confirm Translation Run</h3>
        <p className="translations-modal__text">
          You are about to start a manual translation batch.
        </p>
        <ul className="translations-modal__list">
          <li>Items: {props.items}</li>
          <li>Estimated tokens: {props.tokens.toLocaleString()}</li>
          <li>Estimated cost: ${props.cost.toFixed(4)}</li>
          <li>Target language: {props.lang}</li>
        </ul>
        <div className="translations-modal__actions">
          <button
            className="translations-button translations-button--secondary"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            className="translations-button translations-button--primary"
            onClick={props.onConfirm}
          >
            Confirm & Start
          </button>
        </div>
      </div>
    </div>
  );
}

