import { create } from "zustand";
import {
  JOINT_CONFIGS,
  motorToJointIds,
  jointToMotorName,
  DEFAULT_RANGE_MIN,
  DEFAULT_RANGE_MAX,
  getJointVisualOffsetOverride,
  setJointVisualOffsetOverride,
} from "../lib/jointConfig";
import { pibApi, type Motor } from "../lib/pibApi";
import { ROS_TOPICS, rosBridgeClient } from "../lib/rosApi";
import { loadHomePose, saveHomePose, clearHomePose, type HomePose } from "../lib/calibration";
import { useBackendConnectionStore } from "./backendConnectionStore";

function isBackendConnected(): boolean {
  return useBackendConnectionStore.getState().status === "connected";
}

let suppressIncomingRosUpdatesUntil = 0;

function suppressIncomingRosUpdates(durationMs = 900): void {
  const next = Date.now() + durationMs;
  if (next > suppressIncomingRosUpdatesUntil) {
    suppressIncomingRosUpdatesUntil = next;
  }
}

// ── Motor range types ────────────────────────────────────────────

export interface MotorRange {
  minCentidegrees: number;
  maxCentidegrees: number;
}

// ── Store interface ──────────────────────────────────────────────

interface RobotState {
  /** Joint positions in centidegrees (matches pib-backend / Cerebra) */
  jointPositions: Record<string, number>;
  homePose: HomePose;
  /** Motor ranges fetched from backend, keyed by motor name */
  motorRanges: Record<string, MotorRange>;
  robotCommandEnabled: boolean;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  /** Pairing mode: 3D model moves independently from controls */
  pairingMode: boolean;
  /** Separate positions used by the 3D model during pairing */
  pairingPositions: Record<string, number>;

  /**
   * Currently selected body part (handle id, e.g. "neck", "left_elbow").
   * Drives the axis-gizmo overlay in the 3D viewer: tap a body part to
   * select it, see its rotation arcs, drag an arc to rotate that axis.
   * `null` means nothing is selected (the viewer goes back to the
   * unobtrusive "all handles dim, hover to discover" state).
   */
  selectedHandleId: string | null;
  setSelectedHandle: (handleId: string | null) => void;

  setJointPosition: (jointId: string, centidegrees: number) => void;
  setJointPositionLocal: (jointId: string, centidegrees: number) => void;
  setAllPositions: (positions: Record<string, number>) => void;
  setAllPositionsLocal: (positions: Record<string, number>) => void;
  setRobotCommandEnabled: (enabled: boolean) => void;
  resetPositions: () => void;
  resetPositionsLocal: () => void;
  fetchCurrentPositions: (options?: { preserveLocalPose?: boolean }) => Promise<void>;
  syncJointSelectionToRobot: (jointIds: string[]) => void;
  syncWithRealRobot: () => void;
  setHomePose: (pose: HomePose) => void;
  applyLoadedHomePose: (pose: HomePose) => void;
  setCurrentAsHomePose: () => void;
  clearHomePose: () => void;
  getMotorRange: (jointId: string) => MotorRange;
  setPairingMode: (enabled: boolean) => void;
  setPairingPosition: (jointId: string, centidegrees: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const defaultRange: MotorRange = { minCentidegrees: DEFAULT_RANGE_MIN, maxCentidegrees: DEFAULT_RANGE_MAX };
const syntheticMotorGroups: Record<string, string[]> = {
  all_fingers_left: [
    "thumb_left_stretch",
    "index_left_stretch",
    "middle_left_stretch",
    "ring_left_stretch",
    "pinky_left_stretch",
  ],
  all_fingers_right: [
    "thumb_right_stretch",
    "index_right_stretch",
    "middle_right_stretch",
    "ring_right_stretch",
    "pinky_right_stretch",
  ],
};

const JOINT_RANGE_OVERRIDES: Record<string, MotorRange> = {
  // Keep wrist bend safer and less twitchy in UI + drag interactions.
  right_wrist_bend: { minCentidegrees: -4500, maxCentidegrees: 4500 },
  left_wrist_bend: { minCentidegrees: -4500, maxCentidegrees: 4500 },
};

function getMotorRange(jointId: string, motorRanges: Record<string, MotorRange>): MotorRange {
  const overrideRange = JOINT_RANGE_OVERRIDES[jointId];
  const motorName = jointToMotorName[jointId];
  const baseRange = motorName && motorRanges[motorName]
    ? motorRanges[motorName]
    : defaultRange;

  if (!overrideRange) {
    return baseRange;
  }

  const intersectedMin = Math.max(
    baseRange.minCentidegrees,
    overrideRange.minCentidegrees,
  );
  const intersectedMax = Math.min(
    baseRange.maxCentidegrees,
    overrideRange.maxCentidegrees,
  );

  if (intersectedMin >= intersectedMax) {
    return baseRange;
  }

  return {
    minCentidegrees: intersectedMin,
    maxCentidegrees: intersectedMax,
  };
}

function clampCentidegrees(value: number, range: MotorRange): number {
  return Math.max(range.minCentidegrees, Math.min(range.maxCentidegrees, Math.round(value)));
}

function normalizeMotorRange(min: number, max: number): MotorRange | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  return { minCentidegrees: Math.round(min), maxCentidegrees: Math.round(max) };
}

function extractMotorRanges(motors: Motor[]): Record<string, MotorRange> {
  const ranges: Record<string, MotorRange> = {};
  for (const motor of motors) {
    const range = normalizeMotorRange(
      motor.settings.rotationRangeMin,
      motor.settings.rotationRangeMax
    );
    if (!range) continue;
    ranges[motor.name] = range;
  }
  return ranges;
}

function extractMotorPosition(motor: Motor): number | null {
  const raw = motor as unknown as Record<string, unknown>;
  const candidates = [
    raw.position,
    raw.currentPosition,
    raw.current_position,
    raw.centidegrees,
    raw.value,
  ];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric);
    }
  }

  return null;
}

function getJointIdsForMotorName(motorName: string): string[] {
  const directJointIds = motorToJointIds[motorName];
  if (directJointIds && directJointIds.length > 0) {
    return directJointIds;
  }

  const groupedMotors = syntheticMotorGroups[motorName];
  if (!groupedMotors) {
    return [];
  }

  return groupedMotors.flatMap((name) => motorToJointIds[name] ?? []);
}

function buildPositionsFromMotors(
  motors: Motor[],
  current: Record<string, number>,
  motorRanges: Record<string, MotorRange>
): Record<string, number> {
  const next = { ...current };

  for (const motor of motors) {
    const motorPosition = extractMotorPosition(motor);
    if (motorPosition === null) continue;

    const jointIds = getJointIdsForMotorName(motor.name);
    if (!jointIds || jointIds.length === 0) continue;

    const range = motorRanges[motor.name] ?? defaultRange;
    const clamped = clampCentidegrees(motorPosition, range);

    for (const jointId of jointIds) {
      // UI/store values mirror the physical motor 1:1. Invert is a viewer-only
      // visual calibration (see centidegreesToJointRadians), so it is NOT applied
      // here — applying it on both sides would cancel out.
      next[jointId] = clamped;
    }
  }

  return next;
}

// ── Default positions ────────────────────────────────────────────

function buildDefaultPositions(homePose: HomePose): Record<string, number> {
  const positions: Record<string, number> = {};
  for (const config of JOINT_CONFIGS) {
    positions[config.id] = homePose[config.id] ?? config.defaultCentidegrees;
  }
  return positions;
}

// ── ROSBridge payload ────────────────────────────────────────────

/** Build the motor list for a ROSBridge applyJointTrajectory call. */
function buildMotorPayload(
  positions: Record<string, number>,
  jointIds?: string[]
): Array<{ motorName: string; centidegrees: number }> {
  const seen = new Set<string>();
  const result: Array<{ motorName: string; centidegrees: number }> = [];
  const relevantJointIds = jointIds ? new Set(jointIds) : null;

  for (const config of JOINT_CONFIGS) {
    if (relevantJointIds && !relevantJointIds.has(config.id)) continue;

    const motorName = config.motorName;
    if (seen.has(motorName)) continue;
    seen.add(motorName);

    const uiCentidegrees = positions[config.id] ?? config.defaultCentidegrees;
    // Store values map 1:1 to the motor. Invert is viewer-only, not applied here.
    result.push({ motorName, centidegrees: uiCentidegrees });
  }

  return result;
}

// ── ROS message parsing ──────────────────────────────────────────

interface JointTrajectoryPointLike {
  positions?: unknown;
}

interface JointTrajectoryMessageLike {
  joint_names?: unknown;
  points?: unknown;
}

function parseJointTrajectoryMessage(
  message: unknown
): Array<{ motorName: string; centidegrees: number }> {
  const raw = message as JointTrajectoryMessageLike;
  if (!Array.isArray(raw?.joint_names) || !Array.isArray(raw?.points)) {
    return [];
  }

  const jointNames = raw.joint_names.filter(
    (value): value is string => typeof value === "string"
  );
  if (jointNames.length === 0 || raw.points.length === 0) return [];

  const points = raw.points as JointTrajectoryPointLike[];
  const updates: Array<{ motorName: string; centidegrees: number }> = [];

  // Handle standard ROS shape: one point with positions aligned to joint_names.
  if (points.length === 1 && Array.isArray(points[0]?.positions)) {
    const positions = points[0].positions as unknown[];
    const count = Math.min(jointNames.length, positions.length);
    for (let i = 0; i < count; i += 1) {
      const centidegrees = Number(positions[i]);
      if (!Number.isFinite(centidegrees)) continue;
      updates.push({ motorName: jointNames[i], centidegrees: Math.round(centidegrees) });
    }
    return updates;
  }

  // Handle Cerebra-style shape: one point per motor, each with positions[0].
  const count = Math.min(jointNames.length, points.length);
  for (let i = 0; i < count; i += 1) {
    const point = points[i];
    const firstPosition = Array.isArray(point?.positions)
      ? (point.positions as unknown[])[0]
      : undefined;
    const centidegrees = Number(firstPosition);
    if (!Number.isFinite(centidegrees)) continue;
    updates.push({ motorName: jointNames[i], centidegrees: Math.round(centidegrees) });
  }

  return updates;
}

// ── Re-export for backward compat ────────────────────────────────

/** @deprecated Use jointToMotorName from jointConfig.ts instead */
export const jointToMotorMap = jointToMotorName;

// ── Store ────────────────────────────────────────────────────────

const initialHomePose = loadHomePose();
const initialPositions = buildDefaultPositions(initialHomePose);

export const useRobotStore = create<RobotState>((set, get) => ({
  jointPositions: { ...initialPositions },
  homePose: initialHomePose,
  motorRanges: {},
  robotCommandEnabled: true,
  isConnected: false,
  isLoading: false,
  error: null,
  pairingMode: false,
  pairingPositions: {},
  selectedHandleId: null,
  setSelectedHandle: (handleId: string | null) => set({ selectedHandleId: handleId }),

  getMotorRange: (jointId: string) => {
    return getMotorRange(jointId, get().motorRanges);
  },

  setJointPosition: (jointId: string, centidegrees: number) => {
    const { motorRanges } = get();
    const range = getMotorRange(jointId, motorRanges);
    const clamped = clampCentidegrees(centidegrees, range);

    set((state) => ({
      jointPositions: { ...state.jointPositions, [jointId]: clamped },
    }));
    suppressIncomingRosUpdates();

    if (!get().robotCommandEnabled || get().pairingMode || !isBackendConnected()) return;

    const motorName = jointToMotorName[jointId];
    if (!motorName) return;
    // Store values map 1:1 to the motor. Invert is viewer-only, not applied here.
    rosBridgeClient.applyJointTrajectory([{ motorName, centidegrees: clamped }]);
  },

  setJointPositionLocal: (jointId: string, centidegrees: number) => {
    const { motorRanges } = get();
    const range = getMotorRange(jointId, motorRanges);
    const clamped = clampCentidegrees(centidegrees, range);

    set((state) => ({
      jointPositions: { ...state.jointPositions, [jointId]: clamped },
    }));
    suppressIncomingRosUpdates();
  },

  setAllPositions: (positions: Record<string, number>) => {
    const current = get().jointPositions;
    const { motorRanges } = get();
    const clamped: Record<string, number> = {};
    for (const config of JOINT_CONFIGS) {
      const raw = positions[config.id] ?? current[config.id] ?? config.defaultCentidegrees;
      const range = getMotorRange(config.id, motorRanges);
      clamped[config.id] = clampCentidegrees(raw, range);
    }
    set({ jointPositions: clamped });
    suppressIncomingRosUpdates();

    if (!get().robotCommandEnabled || get().pairingMode || !isBackendConnected()) return;

    const motors = buildMotorPayload(clamped);
    if (motors.length > 0) rosBridgeClient.applyJointTrajectory(motors);
  },

  setAllPositionsLocal: (positions: Record<string, number>) => {
    const current = get().jointPositions;
    const { motorRanges } = get();
    const clamped: Record<string, number> = {};
    for (const config of JOINT_CONFIGS) {
      const raw = positions[config.id] ?? current[config.id] ?? config.defaultCentidegrees;
      const range = getMotorRange(config.id, motorRanges);
      clamped[config.id] = clampCentidegrees(raw, range);
    }
    set({ jointPositions: clamped });
    suppressIncomingRosUpdates();
  },

  setRobotCommandEnabled: (enabled: boolean) => {
    set({ robotCommandEnabled: enabled });
  },

  resetPositions: () => {
    const { homePose } = get();
    const defaults = buildDefaultPositions(homePose);
    set({ jointPositions: defaults });

    if (!get().robotCommandEnabled || !isBackendConnected()) return;

    const motors = buildMotorPayload(defaults);
    if (motors.length > 0) rosBridgeClient.applyJointTrajectory(motors);
  },

  resetPositionsLocal: () => {
    const { homePose } = get();
    const defaults = buildDefaultPositions(homePose);
    set({ jointPositions: defaults });
  },

  fetchCurrentPositions: async (options) => {
    set({ isLoading: true, error: null });
    try {
      const result = await pibApi.motor.getAllMotors();
      const errorMessage = "error" in result ? result.error : undefined;
      if (result.success && result.data) {
        const preserveLocalPose = Boolean(options?.preserveLocalPose);
        const { jointPositions: currentJointPositions, robotCommandEnabled } = get();
        const motorRanges = extractMotorRanges(result.data.motors);
        const fetchedJointPositions = buildPositionsFromMotors(
          result.data.motors,
          currentJointPositions,
          motorRanges
        );

        set({
          isConnected: true,
          isLoading: false,
          error: null,
          motorRanges,
          jointPositions:
            preserveLocalPose && !robotCommandEnabled
              ? currentJointPositions
              : fetchedJointPositions,
        });
      } else {
        set({
          error: errorMessage || "Failed to fetch motors",
          isConnected: false,
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to connect",
        isConnected: false,
        isLoading: false,
      });
    }
  },

  syncJointSelectionToRobot: (jointIds: string[]) => {
    if (!isBackendConnected() || jointIds.length === 0) return;

    const uniqueJointIds = Array.from(new Set(jointIds));
    const { jointPositions } = get();
    const motors = buildMotorPayload(jointPositions, uniqueJointIds);
    if (motors.length > 0) {
      suppressIncomingRosUpdates(1200);
      rosBridgeClient.applyJointTrajectory(motors);
      set({ isConnected: true, error: null });
    }
  },

  syncWithRealRobot: () => {
    const { jointPositions } = get();
    const motors = buildMotorPayload(jointPositions);
    if (motors.length > 0) {
      suppressIncomingRosUpdates(1200);
      rosBridgeClient.applyJointTrajectory(motors);
    }
    set({ isConnected: true, error: null });
  },

  setHomePose: (pose: HomePose) => {
    saveHomePose(pose);
    const defaults = buildDefaultPositions(pose);
    set({ homePose: pose, jointPositions: defaults });
  },

  /** Apply a loaded-from-storage pose to the store without rewriting storage. */
  applyLoadedHomePose: (pose: HomePose) => {
    const defaults = buildDefaultPositions(pose);
    set({ homePose: pose, jointPositions: defaults });
  },

  setCurrentAsHomePose: () => {
    const { jointPositions } = get();
    const pose: HomePose = {};
    for (const config of JOINT_CONFIGS) {
      pose[config.id] = jointPositions[config.id] ?? config.defaultCentidegrees;
    }
    saveHomePose(pose);
    set({ homePose: pose });
  },

  clearHomePose: () => {
    clearHomePose();
    const defaults = buildDefaultPositions({});
    set({ homePose: {}, jointPositions: defaults });
  },

  setPairingMode: (enabled: boolean) => {
    if (enabled) {
      // Enter pairing mode: copy current positions for independent 3D editing
      set({
        pairingMode: true,
        pairingPositions: { ...get().jointPositions },
      });
    } else {
      // Exit pairing mode: persist visual offset delta only.
      // Real robot pose values remain untouched.
      const { pairingPositions, jointPositions } = get();
      for (const config of JOINT_CONFIGS) {
        const jointId = config.id;
        const paired = pairingPositions[jointId] ?? jointPositions[jointId] ?? config.defaultCentidegrees;
        const current = jointPositions[jointId] ?? config.defaultCentidegrees;
        const delta = paired - current;
        if (Math.abs(delta) < 1) continue;

        const nextOffset = getJointVisualOffsetOverride(jointId) + Math.round(delta);
        setJointVisualOffsetOverride(jointId, nextOffset);
      }

      set({
        pairingMode: false,
        pairingPositions: {},
      });
    }
  },

  setPairingPosition: (jointId: string, centidegrees: number) => {
    set((state) => ({
      // Pairing is a visual alignment mode: do not clamp here so the
      // operator can keep rotating until model and real robot match.
      pairingPositions: { ...state.pairingPositions, [jointId]: Math.round(centidegrees) },
    }));
  },
}));

// ── ROS subscription for incoming position updates ───────────────

let robotStateSyncSubscriptionId: string | null = null;

export function startRobotStateSync(): void {
  if (robotStateSyncSubscriptionId) return;

  robotStateSyncSubscriptionId = rosBridgeClient.subscribe(
    ROS_TOPICS.JOINT_TRAJECTORY,
    "trajectory_msgs/JointTrajectory",
    (message) => {
      const updates = parseJointTrajectoryMessage(message);
      if (updates.length === 0) return;

      if (Date.now() < suppressIncomingRosUpdatesUntil) {
        useRobotStore.setState({
          isConnected: true,
          error: null,
        });
        return;
      }

      const { jointPositions, robotCommandEnabled, pairingMode } = useRobotStore.getState();
      // In pairing mode, still accept ROS updates to jointPositions (controls)
      // but skip when in 3D-only mode (no pairing) to preserve local edits
      if (!robotCommandEnabled && !pairingMode) {
        useRobotStore.setState({
          isConnected: true,
          error: null,
        });
        return;
      }

      const nextPositions = { ...jointPositions };
      let changed = false;

      for (const { motorName, centidegrees } of updates) {
        const jointIds = getJointIdsForMotorName(motorName);
        if (!jointIds || jointIds.length === 0) continue;

        for (const jointId of jointIds) {
          // UI/store values map 1:1 to the motor. Invert is viewer-only.
          if (nextPositions[jointId] !== centidegrees) {
            nextPositions[jointId] = centidegrees;
            changed = true;
          }
        }
      }

      if (changed) {
        useRobotStore.setState({
          jointPositions: nextPositions,
          isConnected: true,
          error: null,
        });
      }
    }
  );
}

export function stopRobotStateSync(): void {
  if (!robotStateSyncSubscriptionId) return;
  rosBridgeClient.unsubscribe(robotStateSyncSubscriptionId);
  robotStateSyncSubscriptionId = null;
}
