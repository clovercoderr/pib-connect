import { create } from "zustand";
import { usePoseStore } from "./poseStore";
import { useRobotStore } from "./robotStore";
import type { Pose } from "../lib/pibApi";

export interface WorkflowStep {
  id: string;
  poseId: string;
  poseName: string;
  delayMs: number; // delay after this pose before moving to next
  speedFactor: number; // 0.1 - 2.0, how fast to move to this pose
}

export interface PoseWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  loop: boolean;
  createdAt: string;
}

const LOCAL_WORKFLOWS_KEY = "pib_pose_workflows";

function loadWorkflows(): PoseWorkflow[] {
  try {
    const raw = localStorage.getItem(LOCAL_WORKFLOWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: PoseWorkflow[]) {
  localStorage.setItem(LOCAL_WORKFLOWS_KEY, JSON.stringify(workflows));
}

interface PoseWorkflowState {
  workflows: PoseWorkflow[];
  activeWorkflowId: string | null;
  isPlaying: boolean;
  currentStepIndex: number;
  _abortController: AbortController | null;

  createWorkflow: (name: string) => void;
  deleteWorkflow: (id: string) => void;
  renameWorkflow: (id: string, name: string) => void;
  setActiveWorkflow: (id: string | null) => void;
  addStep: (workflowId: string, pose: Pose, delayMs?: number) => void;
  removeStep: (workflowId: string, stepId: string) => void;
  updateStep: (workflowId: string, stepId: string, updates: Partial<Pick<WorkflowStep, "delayMs" | "speedFactor">>) => void;
  reorderSteps: (workflowId: string, fromIndex: number, toIndex: number) => void;
  toggleLoop: (workflowId: string) => void;
  play: (workflowId: string) => void;
  stop: () => void;
}

export const usePoseWorkflowStore = create<PoseWorkflowState>((set, get) => ({
  workflows: loadWorkflows(),
  activeWorkflowId: null,
  isPlaying: false,
  currentStepIndex: -1,
  _abortController: null,

  createWorkflow: (name: string) => {
    const workflow: PoseWorkflow = {
      id: crypto.randomUUID(),
      name,
      steps: [],
      loop: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().workflows, workflow];
    set({ workflows: updated, activeWorkflowId: workflow.id });
    saveWorkflows(updated);
  },

  deleteWorkflow: (id: string) => {
    const updated = get().workflows.filter((w) => w.id !== id);
    set({
      workflows: updated,
      activeWorkflowId: get().activeWorkflowId === id ? null : get().activeWorkflowId,
    });
    saveWorkflows(updated);
  },

  renameWorkflow: (id: string, name: string) => {
    const updated = get().workflows.map((w) =>
      w.id === id ? { ...w, name } : w
    );
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  setActiveWorkflow: (id: string | null) => {
    set({ activeWorkflowId: id });
  },

  addStep: (workflowId: string, pose: Pose, delayMs = 1000) => {
    const updated = get().workflows.map((w) => {
      if (w.id !== workflowId) return w;
      return {
        ...w,
        steps: [
          ...w.steps,
          {
            id: crypto.randomUUID(),
            poseId: pose.id,
            poseName: pose.name,
            delayMs,
            speedFactor: 1.0,
          },
        ],
      };
    });
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  removeStep: (workflowId: string, stepId: string) => {
    const updated = get().workflows.map((w) => {
      if (w.id !== workflowId) return w;
      return { ...w, steps: w.steps.filter((s) => s.id !== stepId) };
    });
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  updateStep: (workflowId: string, stepId: string, updates) => {
    const updated = get().workflows.map((w) => {
      if (w.id !== workflowId) return w;
      return {
        ...w,
        steps: w.steps.map((s) =>
          s.id === stepId ? { ...s, ...updates } : s
        ),
      };
    });
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  reorderSteps: (workflowId: string, fromIndex: number, toIndex: number) => {
    const updated = get().workflows.map((w) => {
      if (w.id !== workflowId) return w;
      const steps = [...w.steps];
      const [moved] = steps.splice(fromIndex, 1);
      steps.splice(toIndex, 0, moved);
      return { ...w, steps };
    });
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  toggleLoop: (workflowId: string) => {
    const updated = get().workflows.map((w) =>
      w.id === workflowId ? { ...w, loop: !w.loop } : w
    );
    set({ workflows: updated });
    saveWorkflows(updated);
  },

  play: (workflowId: string) => {
    const workflow = get().workflows.find((w) => w.id === workflowId);
    if (!workflow || workflow.steps.length === 0) return;

    // Stop any existing playback
    get().stop();

    const abortController = new AbortController();
    set({ isPlaying: true, currentStepIndex: 0, _abortController: abortController });

    const runWorkflow = async () => {
      const signal = abortController.signal;

      const executeSteps = async () => {
        for (let i = 0; i < workflow.steps.length; i++) {
          if (signal.aborted) return;

          const step = workflow.steps[i];
          set({ currentStepIndex: i });

          // Find the pose and apply it
          const poses = usePoseStore.getState().poses;
          const pose = poses.find((p) => p.id === step.poseId);
          if (pose) {
            useRobotStore.getState().setAllPositions(pose.motorPositions);
          }

          // Wait for the delay
          if (step.delayMs > 0) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, step.delayMs);
              signal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("aborted"));
              }, { once: true });
            }).catch(() => {});
          }

          if (signal.aborted) return;
        }
      };

      try {
        if (workflow.loop) {
          while (!signal.aborted) {
            await executeSteps();
          }
        } else {
          await executeSteps();
        }
      } catch {
        // aborted
      }

      if (!signal.aborted) {
        set({ isPlaying: false, currentStepIndex: -1, _abortController: null });
      }
    };

    runWorkflow();
  },

  stop: () => {
    const { _abortController } = get();
    if (_abortController) {
      _abortController.abort();
    }
    set({ isPlaying: false, currentStepIndex: -1, _abortController: null });
  },
}));
