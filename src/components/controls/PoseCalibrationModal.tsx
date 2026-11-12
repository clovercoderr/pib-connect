import { useEffect, useMemo, useState } from "react";
import { JOINT_CONFIGS } from "../../lib/jointConfig";
import { usePoseStore } from "../../stores/poseStore";
import { useRobotStore } from "../../stores/robotStore";
import { GripSlider } from "./GripSlider";
import { JointSliderGroup } from "./JointSliderGroup";

interface HomePoseModalProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS = [
  { id: "neck", label: "Neck" },
  { id: "right_arm", label: "Right Arm" },
  { id: "left_arm", label: "Left Arm" },
  { id: "right_hand", label: "Right Hand" },
  { id: "left_hand", label: "Left Hand" },
] as const;

function buildCodeDefaults(): Record<string, number> {
  const pose: Record<string, number> = {};
  for (const joint of JOINT_CONFIGS) {
    pose[joint.id] = joint.defaultCentidegrees;
  }
  return pose;
}

export function PoseCalibrationModal({ open, onClose }: HomePoseModalProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "reset">("idle");

  const setAllPositionsLocal = useRobotStore((s) => s.setAllPositionsLocal);
  const jointPositions = useRobotStore((s) => s.jointPositions);
  const homePose = useRobotStore((s) => s.homePose);
  const setCurrentAsHomePose = useRobotStore((s) => s.setCurrentAsHomePose);
  const clearHomePose = useRobotStore((s) => s.clearHomePose);
  const syncWithRealRobot = useRobotStore((s) => s.syncWithRealRobot);
  const setRobotCommandEnabled = useRobotStore((s) => s.setRobotCommandEnabled);

  const poses = usePoseStore((s) => s.poses);
  const isLoading = usePoseStore((s) => s.isLoading);
  const fetchPoses = usePoseStore((s) => s.fetchPoses);

  const codeDefaults = useMemo(() => buildCodeDefaults(), []);

  useEffect(() => {
    if (!open) return;
    fetchPoses();
    setSaveStatus("idle");
  }, [open, fetchPoses]);

  useEffect(() => {
    if (!open) return;
    const previousRobotCommandEnabled = useRobotStore.getState().robotCommandEnabled;
    setRobotCommandEnabled(false);
    return () => setRobotCommandEnabled(previousRobotCommandEnabled);
  }, [open, setRobotCommandEnabled]);

  const homePoseCount = Object.keys(homePose).length;
  const hasHomePose = homePoseCount > 0;

  // Count how many joints differ from code defaults
  const changedFromDefault = useMemo(() => {
    let count = 0;
    for (const joint of JOINT_CONFIGS) {
      const current = jointPositions[joint.id] ?? joint.defaultCentidegrees;
      if (Math.abs(current - joint.defaultCentidegrees) >= 1) count += 1;
    }
    return count;
  }, [jointPositions]);

  if (!open) return null;

  const handleSetHomePose = () => {
    setCurrentAsHomePose();
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleResetHomePose = () => {
    clearHomePose();
    setSaveStatus("reset");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleLoadPose = (poseId: string) => {
    if (poseId === "__defaults__") {
      setAllPositionsLocal(codeDefaults);
      return;
    }
    const pose = poses.find((p) => p.id === poseId);
    if (pose) {
      setAllPositionsLocal({ ...codeDefaults, ...pose.motorPositions });
    }
  };

  // Prevent backdrop close on drag-release (onMouseDown instead of onClick)
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    // Only close if the click target IS the backdrop itself
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-none" />

      <div
        className="relative bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">
              Home Pose
            </h2>
            <p className="text-[10px] text-white/35">
              Set the starting position for all joints using the live Cerebra motor ranges.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Quick actions */}
        <div className="px-5 py-3 border-b border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => handleLoadPose(e.target.value)}
              defaultValue=""
              className="flex-1 bg-white/5 text-white/70 text-xs rounded-lg px-3 py-2 border border-white/10 focus:border-white/30 focus:outline-none transition-colors"
            >
              <option value="" disabled className="bg-neutral-800">
                Load a saved pose...
              </option>
              <option value="__defaults__" className="bg-neutral-800">
                Robot Zero Pose (code defaults)
              </option>
              {poses.map((pose) => (
                <option key={pose.id} value={pose.id} className="bg-neutral-800">
                  {pose.name}
                </option>
              ))}
            </select>
            <button
              onClick={syncWithRealRobot}
              className="px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white/80 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.12] transition-colors whitespace-nowrap"
            >
              Sync 3D &rarr; Robot
            </button>
          </div>

          {isLoading && (
            <p className="text-[10px] text-white/30">Loading poses...</p>
          )}

          {hasHomePose && (
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
              Home Pose set ({homePoseCount} joints)
            </div>
          )}
        </div>

        {/* Joint sliders */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Adjust Joints
            </h4>
            <span className="text-[10px] text-white/30">
              {changedFromDefault} changed from defaults
            </span>
          </div>

          {GROUPS.map((group) => (
            <JointSliderGroup
              key={group.id}
              group={group.id}
              label={group.label}
              localOnly
              prefix={
                (group.id === "right_hand" || group.id === "left_hand")
                  ? <GripSlider side={group.id === "right_hand" ? "right" : "left"} localOnly />
                  : undefined
              }
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
          <button
            onClick={handleSetHomePose}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
              saveStatus === "saved"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-white/10 text-white/80 hover:bg-white/[0.14] border-white/20"
            }`}
          >
            {saveStatus === "saved" ? "Home Pose Saved!" : "Set as Home Pose"}
          </button>
          <button
            onClick={handleResetHomePose}
            className={`px-4 py-2.5 rounded-lg text-xs border transition-colors ${
              saveStatus === "reset"
                ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
                : "text-white/50 hover:text-white/75 bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08]"
            }`}
          >
            {saveStatus === "reset" ? "Reset!" : "Reset to Defaults"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-xs text-white/50 hover:text-white/75 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
