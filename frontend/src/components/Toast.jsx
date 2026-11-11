import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";

// Short confirmation messages ("Link copied") shown in the corner.
//   const toast = useToast();  toast("Link copied");  toast("Could not delete", "error");

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const show = useCallback((message, kind = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext value={value}>
      {children}
      {/* aria-live makes screen readers announce new messages. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
          >
            {toast.kind === "error" ? (
              <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-ember-hot" />
            ) : (
              <Check aria-hidden="true" className="size-4 shrink-0 text-[#6ee7a8]" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
