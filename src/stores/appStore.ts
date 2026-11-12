import { create } from "zustand";

export type AppTab = "3d-view" | "controls" | "poses" | "no-code" | "python" | "ai";

interface AppState {
  activeTab: AppTab;
  splitView: boolean;
  splitRatio: number;
  sidebarCollapsed: boolean;
  calibrationModeEnabled: boolean;
  setActiveTab: (tab: AppTab) => void;
  toggleSplitView: () => void;
  setSplitRatio: (ratio: number) => void;
  toggleSidebar: () => void;
  setCalibrationModeEnabled: (enabled: boolean) => void;
}

const CALIBRATION_MODE_STORAGE_KEY = "pibCalibrationModeEnabled";

function loadCalibrationModeEnabled(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }
  const value = localStorage.getItem(CALIBRATION_MODE_STORAGE_KEY);
  return value === "true";
}

function persistCalibrationModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(CALIBRATION_MODE_STORAGE_KEY, enabled ? "true" : "false");
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "3d-view",
  splitView: false,
  splitRatio: 0.5,
  sidebarCollapsed: false,
  calibrationModeEnabled: loadCalibrationModeEnabled(),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSplitView: () => set((state) => ({ splitView: !state.splitView })),
  setSplitRatio: (ratio) =>
    set({ splitRatio: Math.min(0.7, Math.max(0.3, ratio)) }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCalibrationModeEnabled: (enabled) => {
    persistCalibrationModeEnabled(enabled);
    set({ calibrationModeEnabled: enabled });
  },
}));
