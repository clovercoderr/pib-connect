import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message, type = "info", durationMs = 3000) => {
    const id = String(++nextId);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));

    setTimeout(() => {
      // Start exit animation
      set((s) => ({
        toasts: s.toasts.map((t) =>
          t.id === id ? { ...t, exiting: true } : t
        ),
      }));
      // Remove after animation
      setTimeout(() => get().removeToast(id), 200);
    }, durationMs);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Convenience helpers */
export const toast = {
  success: (msg: string) => useToastStore.getState().addToast(msg, "success"),
  error: (msg: string) => useToastStore.getState().addToast(msg, "error", 5000),
  info: (msg: string) => useToastStore.getState().addToast(msg, "info"),
};
