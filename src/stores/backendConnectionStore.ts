import { create } from "zustand";

type BackendConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface BackendConnectionState {
  status: BackendConnectionStatus;
  error: string | null;
  lastChecked: Date | null;
  isMockMode: boolean;

  setStatus: (status: BackendConnectionStatus) => void;
  setError: (error: string | null) => void;
  setLastChecked: (date: Date) => void;
  setMockMode: (mock: boolean) => void;
  toggleMockMode: () => void;
}

export const useBackendConnectionStore = create<BackendConnectionState>((set) => ({
  status: "disconnected",
  error: null,
  lastChecked: null,
  isMockMode: localStorage.getItem("pibMockMode") === "true",

  setStatus: (status) => set({ status, error: null }),
  setError: (error) => set({ error, status: error ? "error" : "disconnected" }),
  setLastChecked: (date) => set({ lastChecked: date }),
  setMockMode: (mock) => {
    localStorage.setItem("pibMockMode", mock.toString());
    set({ isMockMode: mock });
  },
  toggleMockMode: () => {
    set((state) => {
      const newMock = !state.isMockMode;
      localStorage.setItem("pibMockMode", newMock.toString());
      return { isMockMode: newMock };
    });
  },
}));
