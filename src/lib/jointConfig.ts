export interface JointConfig {
  id: string;
  label: string;
  /** Motor name matching the pib-backend (e.g. "turn_head_motor") */
  motorName: string;
  /** URDF joint name for 3D model */
  urdfJointName: string;
  rotationAxis: "x" | "y" | "z";
  /** Default position in centidegrees (0 = center for most joints) */
  defaultCentidegrees: number;
  /**
   * Visual offset applied only in the 3D viewers so Cerebra motor zero can match
   * the robot's real resting pose even when the URDF joint zero is different.
   */
  visualOffsetCentidegrees?: number;
  group: "neck" | "right_arm" | "left_arm" | "right_hand" | "left_hand";
  /** Invert rotation direction (useful when model's coordinate system differs from expected) */
  invert?: boolean;
}

const JOINT_INVERT_OVERRIDES_KEY = "robotJointInvertOverrides";
const JOINT_VISUAL_OFFSET_OVERRIDES_KEY = "robotJointVisualOffsetOverrides";
const JOINT_HALF_TURN_OVERRIDES_KEY = "robotJointHalfTurnOverrides";
let jointInvertOverridesCache: Record<string, boolean> | null = null;
let jointVisualOffsetOverridesCache: Record<string, number> | null = null;
let jointHalfTurnOverridesCache: Record<string, boolean> | null = null;

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadJointInvertOverrides(): Record<string, boolean> {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(JOINT_INVERT_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, boolean> = {};
    for (const [jointId, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        normalized[jointId] = value;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveJointInvertOverrides(overrides: Record<string, boolean>): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(JOINT_INVERT_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage failures.
  }
}

function ensureInvertOverridesLoaded(): Record<string, boolean> {
  if (!jointInvertOverridesCache) {
    jointInvertOverridesCache = loadJointInvertOverrides();
  }
  return jointInvertOverridesCache;
}

function loadJointVisualOffsetOverrides(): Record<string, number> {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(JOINT_VISUAL_OFFSET_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, number> = {};
    for (const [jointId, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        normalized[jointId] = Math.round(numeric);
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveJointVisualOffsetOverrides(overrides: Record<string, number>): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(JOINT_VISUAL_OFFSET_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage failures.
  }
}

function ensureJointVisualOffsetOverridesLoaded(): Record<string, number> {
  if (!jointVisualOffsetOverridesCache) {
    jointVisualOffsetOverridesCache = loadJointVisualOffsetOverrides();
  }
  return jointVisualOffsetOverridesCache;
}

function loadJointHalfTurnOverrides(): Record<string, boolean> {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = localStorage.getItem(JOINT_HALF_TURN_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: Record<string, boolean> = {};
    for (const [jointId, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        normalized[jointId] = value;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveJointHalfTurnOverrides(overrides: Record<string, boolean>): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(JOINT_HALF_TURN_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage failures.
  }
}

function ensureJointHalfTurnOverridesLoaded(): Record<string, boolean> {
  if (!jointHalfTurnOverridesCache) {
    jointHalfTurnOverridesCache = loadJointHalfTurnOverrides();
  }
  return jointHalfTurnOverridesCache;
}

export function getJointInvert(jointId: string): boolean {
  // Read latest values every time so settings window and main window stay in sync.
  const overrides = canUseLocalStorage()
    ? loadJointInvertOverrides()
    : ensureInvertOverridesLoaded();
  if (typeof overrides[jointId] === "boolean") {
    return overrides[jointId];
  }

  const config = JOINT_CONFIGS.find((j) => j.id === jointId);
  if (!config) {
    return false;
  }

  if (config.group === "right_hand" || config.group === "left_hand") {
    return config.invert ?? false;
  }

  return Boolean(config.invert);
}

export function setJointInvertOverride(jointId: string, invert: boolean): void {
  // Read fresh from storage so a concurrent writer (e.g. Settings window)
  // doesn't get clobbered by a stale in-memory cache merge.
  const overrides = canUseLocalStorage()
    ? loadJointInvertOverrides()
    : ensureInvertOverridesLoaded();
  const next = { ...overrides, [jointId]: invert };
  jointInvertOverridesCache = next;
  saveJointInvertOverrides(next);
}

export function getJointVisualOffsetOverride(jointId: string): number {
  // Read latest values every time so settings window and main window stay in sync.
  const overrides = canUseLocalStorage()
    ? loadJointVisualOffsetOverrides()
    : ensureJointVisualOffsetOverridesLoaded();
  const value = overrides[jointId];
  return Number.isFinite(value) ? value : 0;
}

export function setJointVisualOffsetOverride(jointId: string, offsetCentidegrees: number): void {
  const overrides = canUseLocalStorage()
    ? loadJointVisualOffsetOverrides()
    : ensureJointVisualOffsetOverridesLoaded();
  const normalized = Math.round(offsetCentidegrees);
  const next = { ...overrides, [jointId]: normalized };
  jointVisualOffsetOverridesCache = next;
  saveJointVisualOffsetOverrides(next);
}

export function clearJointVisualOffsetOverrides(): void {
  jointVisualOffsetOverridesCache = {};
  saveJointVisualOffsetOverrides({});
}

export function clearJointInvertOverrides(): void {
  jointInvertOverridesCache = {};
  saveJointInvertOverrides({});
}

export function clearJointHalfTurnOverrides(): void {
  jointHalfTurnOverridesCache = {};
  saveJointHalfTurnOverrides({});
}

/** Total count of joints with any calibration override applied (for UI badges). */
export function countActiveJointOverrides(): number {
  const invert = canUseLocalStorage()
    ? loadJointInvertOverrides()
    : ensureInvertOverridesLoaded();
  const offset = canUseLocalStorage()
    ? loadJointVisualOffsetOverrides()
    : ensureJointVisualOffsetOverridesLoaded();
  const half = canUseLocalStorage()
    ? loadJointHalfTurnOverrides()
    : ensureJointHalfTurnOverridesLoaded();

  const ids = new Set<string>();
  for (const [id, v] of Object.entries(invert)) if (v) ids.add(id);
  for (const [id, v] of Object.entries(offset)) if (v !== 0) ids.add(id);
  for (const [id, v] of Object.entries(half)) if (v) ids.add(id);
  return ids.size;
}

export function getJointHalfTurnOverride(jointId: string): boolean {
  // Read latest values every time so settings window and main window stay in sync.
  const overrides = canUseLocalStorage()
    ? loadJointHalfTurnOverrides()
    : ensureJointHalfTurnOverridesLoaded();
  return Boolean(overrides[jointId]);
}

export function setJointHalfTurnOverride(jointId: string, enabled: boolean): void {
  const overrides = canUseLocalStorage()
    ? loadJointHalfTurnOverrides()
    : ensureJointHalfTurnOverridesLoaded();
  const next = { ...overrides, [jointId]: enabled };
  jointHalfTurnOverridesCache = next;
  saveJointHalfTurnOverrides(next);
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};

  const normalized: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "boolean") {
      normalized[key] = entry;
    }
  }

  return normalized;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  const normalized: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const numeric = Number(entry);
    if (Number.isFinite(numeric)) {
      normalized[key] = Math.round(numeric);
    }
  }

  return normalized;
}

export interface JointOverrideSnapshot {
  invert: Record<string, boolean>;
  visualOffset: Record<string, number>;
  halfTurn: Record<string, boolean>;
}

export function exportJointOverrideSnapshot(): JointOverrideSnapshot {
  return {
    invert: canUseLocalStorage()
      ? loadJointInvertOverrides()
      : ensureInvertOverridesLoaded(),
    visualOffset: canUseLocalStorage()
      ? loadJointVisualOffsetOverrides()
      : ensureJointVisualOffsetOverridesLoaded(),
    halfTurn: canUseLocalStorage()
      ? loadJointHalfTurnOverrides()
      : ensureJointHalfTurnOverridesLoaded(),
  };
}

export function importJointOverrideSnapshot(snapshot: Partial<JointOverrideSnapshot>): void {
  const invert = snapshot.invert === undefined
    ? (canUseLocalStorage() ? loadJointInvertOverrides() : ensureInvertOverridesLoaded())
    : normalizeBooleanRecord(snapshot.invert);
  const visualOffset = snapshot.visualOffset === undefined
    ? (canUseLocalStorage() ? loadJointVisualOffsetOverrides() : ensureJointVisualOffsetOverridesLoaded())
    : normalizeNumberRecord(snapshot.visualOffset);
  const halfTurn = snapshot.halfTurn === undefined
    ? (canUseLocalStorage() ? loadJointHalfTurnOverrides() : ensureJointHalfTurnOverridesLoaded())
    : normalizeBooleanRecord(snapshot.halfTurn);

  jointInvertOverridesCache = invert;
  saveJointInvertOverrides(invert);

  jointVisualOffsetOverridesCache = visualOffset;
  saveJointVisualOffsetOverrides(visualOffset);

  jointHalfTurnOverridesCache = halfTurn;
  saveJointHalfTurnOverrides(halfTurn);
}

/** Convert centidegrees to radians. This is the primary conversion for the 3D model. */
export function centidegreesToRadians(centideg: number): number {
  return (centideg / 100) * (Math.PI / 180);
}

/** Convert radians to centidegrees. */
export function radiansToCentidegrees(radians: number): number {
  return Math.round(radians * (180 / Math.PI) * 100);
}

/** Default motor range in centidegrees (matches pib-backend default). */
export const DEFAULT_RANGE_MIN = -9000;
export const DEFAULT_RANGE_MAX = 9000;

export const JOINT_CONFIGS: JointConfig[] = [
  // Neck
  {
    id: "neck_pan",
    label: "Neck Pan",
    motorName: "turn_head_motor",
    urdfJointName: "head_horizontal",
    rotationAxis: "y",
    defaultCentidegrees: 0,
    group: "neck",
  },
  {
    id: "neck_tilt",
    label: "Neck Tilt",
    motorName: "tilt_forward_motor",
    urdfJointName: "head_vertical",
    rotationAxis: "x",
    defaultCentidegrees: 0,
    group: "neck",
  },
  // Right Arm
  {
    id: "right_shoulder_inner",
    label: "R. Shoulder (Vertical)",
    motorName: "shoulder_vertical_right",
    urdfJointName: "shoulder_vertical_right",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_arm",
    invert: true,
  },
  {
    id: "right_shoulder_outer",
    label: "R. Shoulder (Horizontal)",
    motorName: "shoulder_horizontal_right",
    urdfJointName: "shoulder_horizontal_right",
    rotationAxis: "x",
    defaultCentidegrees: -9000,
    group: "right_arm",
    invert: true,
  },
  {
    id: "right_upper_arm_rotation",
    label: "R. Upper Arm Rotation",
    motorName: "upper_arm_right_rotation",
    urdfJointName: "upper_arm_right",
    rotationAxis: "y",
    defaultCentidegrees: 0,
    group: "right_arm",
    invert: true,
  },
  {
    id: "right_elbow",
    label: "R. Elbow",
    motorName: "elbow_right",
    urdfJointName: "elbow_right",
    rotationAxis: "x",
    defaultCentidegrees: 5500,
    group: "right_arm",
    invert: true,
  },
  {
    id: "right_wrist",
    label: "R. Forearm Rotation",
    motorName: "lower_arm_right_rotation",
    urdfJointName: "forearm_right",
    rotationAxis: "z",
    defaultCentidegrees: 0,
    group: "right_arm",
    invert: true,
  },
  {
    id: "right_wrist_bend",
    label: "R. Wrist Position",
    motorName: "wrist_right",
    urdfJointName: "wrist_right",
    rotationAxis: "z",
    defaultCentidegrees: 0,
    group: "right_arm",
    invert: false,
  },
  // Left Arm
  {
    id: "left_shoulder_inner",
    label: "L. Shoulder (Vertical)",
    motorName: "shoulder_vertical_left",
    urdfJointName: "shoulder_vertical_left",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_arm",
  },
  {
    id: "left_shoulder_outer",
    label: "L. Shoulder (Horizontal)",
    motorName: "shoulder_horizontal_left",
    urdfJointName: "shoulder_horizontal_left",
    rotationAxis: "x",
    defaultCentidegrees: -9000,
    group: "left_arm",
    invert: true,
  },
  {
    id: "left_upper_arm_rotation",
    label: "L. Upper Arm Rotation",
    motorName: "upper_arm_left_rotation",
    urdfJointName: "upper_arm_left",
    rotationAxis: "y",
    defaultCentidegrees: 0,
    group: "left_arm",
    invert: true,
  },
  {
    id: "left_elbow",
    label: "L. Elbow",
    motorName: "elbow_left",
    urdfJointName: "elbow_left",
    rotationAxis: "x",
    defaultCentidegrees: 5500,
    group: "left_arm",
    invert: true,
  },
  {
    id: "left_wrist",
    label: "L. Forearm Rotation",
    motorName: "lower_arm_left_rotation",
    urdfJointName: "forearm_left",
    rotationAxis: "z",
    defaultCentidegrees: 0,
    group: "left_arm",
    invert: true,
  },
  {
    id: "left_wrist_bend",
    label: "L. Wrist Position",
    motorName: "wrist_left",
    urdfJointName: "wrist_left",
    rotationAxis: "z",
    defaultCentidegrees: 0,
    group: "left_arm",
    invert: false,
  },
  // Right Hand Fingers
  {
    id: "right_thumb_proximal",
    label: "R. Thumb (Opposition)",
    motorName: "thumb_right_opposition",
    urdfJointName: "thumb_right_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_thumb_distal",
    label: "R. Thumb (Stretch)",
    motorName: "thumb_right_stretch",
    urdfJointName: "thumb_right_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_index_proximal",
    label: "R. Index (Proximal)",
    motorName: "index_right_stretch",
    urdfJointName: "index_right_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_index_distal",
    label: "R. Index (Distal)",
    motorName: "index_right_stretch",
    urdfJointName: "index_right_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_middle_proximal",
    label: "R. Middle (Proximal)",
    motorName: "middle_right_stretch",
    urdfJointName: "middle_right_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_middle_distal",
    label: "R. Middle (Distal)",
    motorName: "middle_right_stretch",
    urdfJointName: "middle_right_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  // Left Hand Fingers
  {
    id: "left_thumb_proximal",
    label: "L. Thumb (Opposition)",
    motorName: "thumb_left_opposition",
    urdfJointName: "thumb_left_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_thumb_distal",
    label: "L. Thumb (Stretch)",
    motorName: "thumb_left_stretch",
    urdfJointName: "thumb_left_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_index_proximal",
    label: "L. Index (Proximal)",
    motorName: "index_left_stretch",
    urdfJointName: "index_left_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_index_distal",
    label: "L. Index (Distal)",
    motorName: "index_left_stretch",
    urdfJointName: "index_left_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_middle_proximal",
    label: "L. Middle (Proximal)",
    motorName: "middle_left_stretch",
    urdfJointName: "middle_left_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_middle_distal",
    label: "L. Middle (Distal)",
    motorName: "middle_left_stretch",
    urdfJointName: "middle_left_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  // Right Hand - Ring
  {
    id: "right_ring_proximal",
    label: "R. Ring (Proximal)",
    motorName: "ring_right_stretch",
    urdfJointName: "ring_right_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_ring_distal",
    label: "R. Ring (Distal)",
    motorName: "ring_right_stretch",
    urdfJointName: "ring_right_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  // Right Hand - Pinky
  {
    id: "right_pinky_proximal",
    label: "R. Pinky (Proximal)",
    motorName: "pinky_right_stretch",
    urdfJointName: "pinky_right_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  {
    id: "right_pinky_distal",
    label: "R. Pinky (Distal)",
    motorName: "pinky_right_stretch",
    urdfJointName: "pinky_right_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "right_hand",
  },
  // Left Hand - Ring
  {
    id: "left_ring_proximal",
    label: "L. Ring (Proximal)",
    motorName: "ring_left_stretch",
    urdfJointName: "ring_left_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_ring_distal",
    label: "L. Ring (Distal)",
    motorName: "ring_left_stretch",
    urdfJointName: "ring_left_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  // Left Hand - Pinky
  {
    id: "left_pinky_proximal",
    label: "L. Pinky (Proximal)",
    motorName: "pinky_left_stretch",
    urdfJointName: "pinky_left_proximal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
  {
    id: "left_pinky_distal",
    label: "L. Pinky (Distal)",
    motorName: "pinky_left_stretch",
    urdfJointName: "pinky_left_distal",
    rotationAxis: "z",
    defaultCentidegrees: -9000,
    group: "left_hand",
  },
];

/** Lookup map: joint ID → JointConfig */
export const jointConfigById = new Map(JOINT_CONFIGS.map((c) => [c.id, c]));

/** Lookup map: motor name → joint IDs (multiple joints may share one motor) */
export const motorToJointIds: Record<string, string[]> = {};
for (const config of JOINT_CONFIGS) {
  if (!motorToJointIds[config.motorName]) motorToJointIds[config.motorName] = [];
  motorToJointIds[config.motorName].push(config.id);
}

/** Lookup map: joint ID → motor name */
export const jointToMotorName: Record<string, string> = {};
for (const config of JOINT_CONFIGS) {
  jointToMotorName[config.id] = config.motorName;
}

export function getJointVisualOffset(jointId: string): number {
  const baseOffset = jointConfigById.get(jointId)?.visualOffsetCentidegrees ?? 0;
  return baseOffset + getJointVisualOffsetOverride(jointId);
}

function mapUiCentidegreesToViewerCentidegrees(jointId: string, centideg: number): number {
  const config = jointConfigById.get(jointId);
  const clamped = Math.max(DEFAULT_RANGE_MIN, Math.min(DEFAULT_RANGE_MAX, Math.round(centideg)));

  let mapped = clamped;

  if (config?.group === "right_hand" || config?.group === "left_hand") {
    // Requested behavior:
    // -90 should behave like the previous 0, +90 stays fully closed.
    // This maps UI [-90..90] to previous [0..90].
    mapped = Math.round((clamped + 9000) * 0.5);
  }

  return getJointInvert(jointId) ? -mapped : mapped;
}

export function centidegreesToJointRadians(jointId: string, centideg: number): number {
  const halfTurn = getJointHalfTurnOverride(jointId) ? 18000 : 0;
  const viewerCentideg = mapUiCentidegreesToViewerCentidegrees(jointId, centideg);
  return centidegreesToRadians(viewerCentideg + getJointVisualOffset(jointId) + halfTurn);
}
