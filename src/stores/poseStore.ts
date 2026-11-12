import { create } from "zustand";
import { type Pose } from "../lib/pibApi";
import { useRobotStore } from "./robotStore";
import { JOINT_CONFIGS, motorToJointIds } from "../lib/jointConfig";

const LOCAL_POSES_KEY_PREFIX = "pib_local_poses";
// Bump when pose format changes to auto-clear stale saved poses
const LOCAL_POSES_VERSION_KEY_PREFIX = "pib_local_poses_version";
const LOCAL_POSES_VERSION = 2; // v2: centidegrees
const DEFAULT_POSE_SCOPE = "__global__";

function getPoseScope(scope: string | null | undefined): string {
  const normalized = scope?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_POSE_SCOPE;
}

function getLocalPosesKey(scope: string): string {
  return `${LOCAL_POSES_KEY_PREFIX}:${scope}`;
}

function getLocalPosesVersionKey(scope: string): string {
  return `${LOCAL_POSES_VERSION_KEY_PREFIX}:${scope}`;
}

function loadLocalPoses(scope: string): Pose[] {
  try {
    const versionKey = getLocalPosesVersionKey(scope);
    const posesKey = getLocalPosesKey(scope);
    const version = localStorage.getItem(versionKey);
    if (version !== String(LOCAL_POSES_VERSION)) {
      // Format changed — clear stale poses
      localStorage.removeItem(posesKey);
      localStorage.setItem(versionKey, String(LOCAL_POSES_VERSION));
      return [];
    }
    const raw = localStorage.getItem(posesKey);
    const poses: Pose[] = raw ? JSON.parse(raw) : [];
    return poses.map(normalizePose);
  } catch {
    return [];
  }
}

function saveLocalPoses(scope: string, poses: Pose[]) {
  localStorage.setItem(getLocalPosesKey(scope), JSON.stringify(poses));
  localStorage.setItem(getLocalPosesVersionKey(scope), String(LOCAL_POSES_VERSION));
}

const jointIdSet = new Set(JOINT_CONFIGS.map((c) => c.id));

/**
 * Convert backend motor positions to our joint ID format.
 * Cerebra uses motor names (e.g. "turn_head_motor") as keys with centidegree values.
 * Our app uses joint IDs (e.g. "neck_pan") as keys, also in centidegrees.
 */
function convertBackendMotorPositions(
  positions: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [key, value] of Object.entries(positions)) {
    if (jointIdSet.has(key)) {
      // Already a joint ID — use as-is (centidegrees)
      result[key] = value;
    } else {
      // Motor name — map to joint IDs
      const jointIds = motorToJointIds[key];
      if (jointIds) {
        for (const jointId of jointIds) {
          result[jointId] = value;
        }
      }
    }
  }

  return result;
}

function normalizePose(pose: Pose): Pose {
  return {
    ...pose,
    id: pose.id || crypto.randomUUID(),
    motorPositions: convertBackendMotorPositions(pose.motorPositions),
  };
}

interface PoseState {
  projectScope: string;
  poses: Pose[];
  isLoading: boolean;
  error: string | null;

  setProjectScope: (projectName: string | null) => void;
  fetchPoses: () => Promise<void>;
  savePose: (name: string) => Promise<void>;
  applyPose: (pose: Pose) => void;
  deletePose: (poseId: string) => Promise<void>;
  renamePose: (poseId: string, name: string) => Promise<void>;
  setPoses: (poses: Pose[]) => void;
}

export const usePoseStore = create<PoseState>((set, get) => ({
  projectScope: DEFAULT_POSE_SCOPE,
  poses: loadLocalPoses(DEFAULT_POSE_SCOPE),
  isLoading: false,
  error: null,

  setProjectScope: (projectName: string | null) => {
    const nextScope = getPoseScope(projectName);
    if (get().projectScope === nextScope) return;
    set({
      projectScope: nextScope,
      poses: loadLocalPoses(nextScope),
      error: null,
    });
  },

  fetchPoses: async () => {
    set({ isLoading: true, error: null });

    const scoped = get().projectScope;
    const localPoses = loadLocalPoses(scoped);
    set({ poses: localPoses, isLoading: false });
    saveLocalPoses(scoped, localPoses);
  },

  savePose: async (name: string) => {
    const jointPositions = useRobotStore.getState().jointPositions;
    const newPose: Pose = {
      id: crypto.randomUUID(),
      name,
      motorPositions: { ...jointPositions },
    };

    const updated = [...get().poses, newPose];
    set({ poses: updated });
    saveLocalPoses(get().projectScope, updated);
  },

  applyPose: (pose: Pose) => {
    const setAllPositions = useRobotStore.getState().setAllPositions;
    setAllPositions(convertBackendMotorPositions(pose.motorPositions));
  },

  deletePose: async (poseId: string) => {
    const updated = get().poses.filter((p) => p.id !== poseId);
    set({ poses: updated });
    saveLocalPoses(get().projectScope, updated);
  },

  renamePose: async (poseId: string, name: string) => {
    const updated = get().poses.map((p) =>
      p.id === poseId ? { ...p, name } : p
    );
    set({ poses: updated });
    saveLocalPoses(get().projectScope, updated);
  },

  setPoses: (poses: Pose[]) => {
    const normalized = poses.map(normalizePose);
    set({ poses: normalized });
    saveLocalPoses(get().projectScope, normalized);
  },
}));
