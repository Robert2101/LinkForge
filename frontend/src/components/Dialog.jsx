import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// A modal built on the browser's own <dialog>. That gives us, for free:
// focus stays inside while it is open, Escape closes it, and the page behind
// cannot be clicked or read by screen readers.
export function Dialog({ title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Escape was pressed. Let React close it by unmounting, not the browser.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dimmed backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] overscroll-contain rounded-lg bg-surface p-0 text-ink shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id="dialog-title" className="heading text-lg">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="btn btn-quiet -mr-2 -mt-1 px-2">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

// "Are you sure?" for actions that cannot be undone.
export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
