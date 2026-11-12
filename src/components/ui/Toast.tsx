import { useToastStore, type ToastType } from "../../stores/toastStore";

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLES: Record<ToastType, string> = {
  success: "border-emerald-400/20 bg-emerald-400/[0.06]",
  error: "border-red-400/20 bg-red-400/[0.06]",
  info: "border-blue-400/20 bg-blue-400/[0.06]",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg shadow-black/25 backdrop-blur-xl ${STYLES[t.type]} ${t.exiting ? "toast-exit" : "toast-enter"}`}
          onClick={() => removeToast(t.id)}
        >
          {ICONS[t.type]}
          <span className="text-xs font-medium text-white/85">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
