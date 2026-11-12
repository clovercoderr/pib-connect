import { create } from "zustand";

export type ExecutionTarget = "simulator" | "robot";

interface ExecutionTargetState {
  target: ExecutionTarget;
  setTarget: (target: ExecutionTarget) => void;
}

export const useExecutionTargetStore = create<ExecutionTargetState>((set) => ({
  target: "simulator", // Default to simulator for safety
  setTarget: (target) => set({ target }),
}));
