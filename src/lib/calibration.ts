/**
 * Home Pose System
 *
 * Simple concept: save a set of motor positions as the "home pose".
 * When the app starts, sliders load at the home pose values.
 * The 3D model shows exactly what the real robot looks like.
 * Values are in centidegrees (matching pib-backend / Cerebra).
 * Slider value = motor value (centidegrees).
 */

export type HomePose = Record<string, number>;

const HOME_POSE_STORAGE_KEY = "robotHomePose";
const HOME_POSE_VERSION_KEY = "robotHomePoseVersion";
// Bump this whenever default positions change to auto-clear stale saved poses
// v3: switched from 0-1023 to centidegrees
// v4: shoulder viewer zero-offset changed to match the robot's resting arm pose
// v5: defaults now match Cerebra startup pose (shoulders -9000, elbows 5500, fingers -9000)
const HOME_POSE_VERSION = 5;
const DEFAULT_HOME_POSE_SCOPE = "__global__";
let activeHomePoseScope = DEFAULT_HOME_POSE_SCOPE;

function getScopedKey(base: string): string {
  return `${base}:${activeHomePoseScope}`;
}

export function setHomePoseScope(scope: string | null | undefined): void {
  const normalized = scope?.trim();
  activeHomePoseScope = normalized && normalized.length > 0
    ? normalized
    : DEFAULT_HOME_POSE_SCOPE;
}

/**
 * Load home pose from localStorage.
 * Returns empty object if none saved (will fall back to jointConfig defaults).
 * Auto-clears saved pose when defaults change (detected via version mismatch).
 */
export function loadHomePose(): HomePose {
  try {
    const versionKey = getScopedKey(HOME_POSE_VERSION_KEY);
    const poseKey = getScopedKey(HOME_POSE_STORAGE_KEY);
    const savedVersion = localStorage.getItem(versionKey);
    if (savedVersion !== String(HOME_POSE_VERSION)) {
      // Defaults changed — clear stale saved pose so new defaults take effect
      localStorage.removeItem(poseKey);
      localStorage.setItem(versionKey, String(HOME_POSE_VERSION));
      return {};
    }
    const saved = localStorage.getItem(poseKey);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn("Failed to load home pose:", error);
  }
  return {};
}

/**
 * Save home pose to localStorage.
 */
export function saveHomePose(pose: HomePose): void {
  try {
    localStorage.setItem(getScopedKey(HOME_POSE_STORAGE_KEY), JSON.stringify(pose));
    localStorage.setItem(getScopedKey(HOME_POSE_VERSION_KEY), String(HOME_POSE_VERSION));
  } catch (error) {
    console.error("Failed to save home pose:", error);
  }
}

/**
 * Clear saved home pose (revert to jointConfig defaults).
 */
export function clearHomePose(): void {
  try {
    localStorage.removeItem(getScopedKey(HOME_POSE_STORAGE_KEY));
  } catch (error) {
    console.error("Failed to clear home pose:", error);
  }
}
