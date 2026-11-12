import { create } from "zustand";

export type ViewMode = "full" | "head" | "right_arm" | "left_arm" | "right_hand" | "left_hand";

export interface ViewPreset {
  camera: [number, number, number];
  target: [number, number, number];
  label: string;
  groups: string[];
}

// Camera positions for URDF model - optimized for each body part
export const VIEW_PRESETS: Record<ViewMode, ViewPreset> = {
  full: {
    camera: [0, 1.58, 1.9],
    target: [0, 0.9, 0],
    label: "Full",
    groups: ["neck", "right_arm", "left_arm", "right_hand", "left_hand"],
  },
  head: {
    camera: [0, 2.0, 1.2],
    target: [0, 1.65, 0],
    label: "Head",
    groups: ["neck"],
  },
  right_arm: {
    camera: [-1.5, 1.2, 1.5],
    target: [-0.6, 0.9, 0],
    label: "R. Arm",
    groups: ["right_arm"],
  },
  left_arm: {
    camera: [1.5, 1.2, 1.5],
    target: [0.6, 0.9, 0],
    label: "L. Arm",
    groups: ["left_arm"],
  },
  right_hand: {
    camera: [-1.0, 0.6, 0.8],
    target: [-0.7, 0.35, 0.25],
    label: "R. Hand",
    groups: ["right_hand"],
  },
  left_hand: {
    camera: [1.0, 0.6, 0.8],
    target: [0.7, 0.35, 0.25],
    label: "L. Hand",
    groups: ["left_hand"],
  },
};

export const VIEW_MODES: ViewMode[] = ["full", "head", "right_arm", "left_arm", "right_hand", "left_hand"];

interface ViewState {
  viewMode: ViewMode;
  cameraZoomFactor: number;
  setViewMode: (mode: ViewMode) => void;
  zoomInCamera: () => void;
  zoomOutCamera: () => void;
  resetCameraZoom: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: "full",
  cameraZoomFactor: 1,
  setViewMode: (mode) => set({ viewMode: mode }),
  zoomInCamera: () =>
    set((state) => ({
      cameraZoomFactor: Math.max(0.6, Number((state.cameraZoomFactor * 0.88).toFixed(3))),
    })),
  zoomOutCamera: () =>
    set((state) => ({
      cameraZoomFactor: Math.min(1.8, Number((state.cameraZoomFactor * 1.12).toFixed(3))),
    })),
  resetCameraZoom: () => set({ cameraZoomFactor: 1 }),
}));
