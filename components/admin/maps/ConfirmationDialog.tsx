import { useEffect, useRef } from "react";

export function ConfirmationDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!props.open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.busy) props.onCancel();
      if (event.key === "Tab") {
        const dialog = document.querySelector<HTMLElement>("[data-confirm-dialog]");
        const buttons = dialog?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);
  if (!props.open) return null;
  return (
    <div className="map-dialog-backdrop" role="presentation">
      <div className="map-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" data-confirm-dialog>
        <h2 id="confirm-title">{props.title}</h2>
        <p>{props.description}</p>
        <div className="map-confirm-dialog__actions">
          <button ref={cancelRef} type="button" onClick={props.onCancel} disabled={props.busy}>Отмена</button>
          <button className={props.destructive ? "is-destructive" : "is-primary"} type="button" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? "Подождите…" : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
