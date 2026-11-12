import { useEffect, useState } from "react";
import { JointSliderGroup } from "./JointSliderGroup";
import { PosePanel } from "./PosePanel";
import { SavePoseDialog } from "./SavePoseDialog";
import { GripSlider } from "./GripSlider";
import { useRobotStore } from "../../stores/robotStore";
import { usePoseStore } from "../../stores/poseStore";
import { useAppStore } from "../../stores/appStore";
import { useViewStore, VIEW_PRESETS, VIEW_MODES } from "../../stores/viewStore";
import CameraFeed from "../camera/CameraFeed";
import CameraControls from "../camera/CameraControls";
import { Navbar } from "../ui/Navbar";
import { clearJointVisualOffsetOverrides } from "../../lib/jointConfig";
import { toast } from "../../stores/toastStore";

type ControlsSection = "motors" | "poses" | "camera";

const TABS: { id: ControlsSection; label: string }[] = [
  { id: "motors", label: "Motors" },
  { id: "poses", label: "Poses" },
  { id: "camera", label: "Camera" },
];

function MotorsSection() {
  const [startupPoseSaved, setStartupPoseSaved] = useState(false);
  const calibrationModeEnabled = useAppStore((s) => s.calibrationModeEnabled);
  const setCalibrationModeEnabled = useAppStore((s) => s.setCalibrationModeEnabled);
  const resetPositionsLocal = useRobotStore((s) => s.resetPositionsLocal);
  const syncWithRealRobot = useRobotStore((s) => s.syncWithRealRobot);
  const setCurrentAsHomePose = useRobotStore((s) => s.setCurrentAsHomePose);
  const fetchCurrentPositions = useRobotStore((s) => s.fetchCurrentPositions);
  const setAllPositionsLocal = useRobotStore((s) => s.setAllPositionsLocal);
  const robotCommandEnabled = useRobotStore((s) => s.robotCommandEnabled);
  const setRobotCommandEnabled = useRobotStore((s) => s.setRobotCommandEnabled);
  const setPairingMode = useRobotStore((s) => s.setPairingMode);
  const isLoading = useRobotStore((s) => s.isLoading);
  const error = useRobotStore((s) => s.error);
  const pairingMode = useRobotStore((s) => s.pairingMode);
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const activeGroups = VIEW_PRESETS[viewMode].groups;

  useEffect(() => {
    const STORAGE_KEY = "pibCalibrationModeEnabled";

    const syncCalibrationMode = () => {
      const enabled = localStorage.getItem(STORAGE_KEY) === "true";
      if (enabled !== useAppStore.getState().calibrationModeEnabled) {
        setCalibrationModeEnabled(enabled);
      }
    };

    // Initial sync when controls mount.
    syncCalibrationMode();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      syncCalibrationMode();
    };

    const onFocus = () => syncCalibrationMode();
    const onVisibilityChange = () => {
      if (!document.hidden) syncCalibrationMode();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [setCalibrationModeEnabled]);
  const saveCurrentAsStartupPose = () => {
    setCurrentAsHomePose();
    setStartupPoseSaved(true);
    toast.success("Startup pose saved");
    window.setTimeout(() => setStartupPoseSaved(false), 1800);
  };

  const resetAlignmentOffsets = () => {
    clearJointVisualOffsetOverrides();
    setAllPositionsLocal({ ...useRobotStore.getState().jointPositions });
    toast.info("3D alignment offsets reset");
  };

  return (
    <div className="space-y-4">
      {calibrationModeEnabled && (
        <CalibrationPanel
          pairingMode={pairingMode}
          robotCommandEnabled={robotCommandEnabled}
          isLoading={isLoading}
          error={error}
          startupPoseSaved={startupPoseSaved}
          onTogglePairing={() => setPairingMode(!pairingMode)}
          onFinishPairing={() => setPairingMode(false)}
          onToggleRobotSync={() => !pairingMode && setRobotCommandEnabled(!robotCommandEnabled)}
          onFetch={() => {
            fetchCurrentPositions({ preserveLocalPose: true })
              .then(() => toast.success("Motor data fetched"))
              .catch(() => toast.error("Failed to fetch motor data"));
          }}
          onApply={() => {
            syncWithRealRobot();
            toast.success("Pose applied to robot");
          }}
          onResetPose={() => {
            resetPositionsLocal();
            toast.info("Reset to startup pose");
          }}
          onResetOffsets={resetAlignmentOffsets}
          onSaveStartupPose={saveCurrentAsStartupPose}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">
            Focus Area
          </span>
          <span className="text-[11px] text-white/35">
            Choose the body part you want to adjust.
          </span>
        </div>
        <Navbar
          items={VIEW_MODES.map((mode) => ({
            id: mode,
            label: VIEW_PRESETS[mode].label,
          }))}
          activeId={viewMode}
          onChange={setViewMode}
          className="w-full flex-wrap rounded-[1.2rem] bg-[#171824]/95 p-1"
        />
      </div>

      <div className="space-y-2">
        {activeGroups.includes("neck") && (
          <JointSliderGroup group="neck" label="Neck" />
        )}
        {activeGroups.includes("right_arm") && (
          <JointSliderGroup group="right_arm" label="Right Arm" />
        )}
        {activeGroups.includes("left_arm") && (
          <JointSliderGroup group="left_arm" label="Left Arm" />
        )}
        {activeGroups.includes("right_hand") && (
          <JointSliderGroup
            group="right_hand"
            label="Right Hand"
            prefix={<GripSlider side="right" />}
          />
        )}
        {activeGroups.includes("left_hand") && (
          <JointSliderGroup
            group="left_hand"
            label="Left Hand"
            prefix={<GripSlider side="left" />}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Calibration Panel — visually consistent with the rest of the dark UI
// and organized as a clear three-step workflow instead of a button grid.
// ─────────────────────────────────────────────────────────────────────

interface CalibrationPanelProps {
  pairingMode: boolean;
  robotCommandEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  startupPoseSaved: boolean;
  onTogglePairing: () => void;
  onFinishPairing: () => void;
  onToggleRobotSync: () => void;
  onFetch: () => void;
  onApply: () => void;
  onResetPose: () => void;
  onResetOffsets: () => void;
  onSaveStartupPose: () => void;
}

function CalibrationPanel({
  pairingMode,
  robotCommandEnabled,
  isLoading,
  error,
  startupPoseSaved,
  onTogglePairing,
  onFinishPairing,
  onToggleRobotSync,
  onFetch,
  onApply,
  onResetPose,
  onResetOffsets,
  onSaveStartupPose,
}: CalibrationPanelProps) {
  const stepIdx = pairingMode ? 2 : 1;

  return (
    <div className="rounded-xl bg-[#1a1a24]/80 backdrop-blur-xl border border-white/[0.06] overflow-hidden anim-fade-in-up">
      {/* Header — same visual language as Navbar / cards elsewhere */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`w-2 h-2 rounded-full ${pairingMode ? "bg-blue-400 anim-pulse-soft" : "bg-white/30"}`} />
            {pairingMode && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-400/30 animate-ping" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white/85 leading-tight truncate">Calibration</p>
            <p className="text-[10px] text-white/35 leading-tight truncate">
              {pairingMode
                ? "Pairing — drag the 3D model until it matches the real robot"
                : robotCommandEnabled
                  ? "3D mirrors the robot — toggle 3D-only to plan poses safely"
                  : "3D-only — robot will not move until you press Apply"}
            </p>
          </div>
        </div>
        {/* Mini progress dots */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                n <= stepIdx ? "bg-blue-400/80" : "bg-white/12"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Get current state */}
      <CalibrationStep
        index={1}
        title="Pull current robot pose"
        description="Read motor positions from Cerebra into the 3D view."
      >
        <button
          onClick={onFetch}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.1] text-white/80 border border-white/[0.08] transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] disabled:opacity-50"
        >
          {isLoading ? "Fetching…" : "Fetch from Cerebra"}
        </button>
      </CalibrationStep>

      {/* Step 2: Pair */}
      <CalibrationStep
        index={2}
        title="Align the 3D model with reality"
        description={
          pairingMode
            ? "Drag handles in the 3D view. The real robot stays still."
            : "Decouple 3D from the robot, then drag handles to match what you see in person."
        }
        active={pairingMode}
      >
        <button
          onClick={pairingMode ? onFinishPairing : onTogglePairing}
          className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
            pairingMode
              ? "bg-blue-500/20 hover:bg-blue-500/28 text-blue-200 border-blue-400/30"
              : "bg-white/[0.06] hover:bg-white/[0.1] text-white/80 border-white/[0.08]"
          }`}
        >
          {pairingMode ? "Finish & save offsets" : "Start pairing"}
        </button>
      </CalibrationStep>

      {/* Step 3: Commit */}
      <CalibrationStep
        index={3}
        title="Apply or save"
        description="Send the 3D pose to the robot, or save it as the startup pose."
        last
      >
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={onApply}
            disabled={pairingMode}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/22 text-emerald-300 border border-emerald-500/25 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply to robot
          </button>
          <button
            onClick={onSaveStartupPose}
            className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
              startupPoseSaved
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                : "bg-white/[0.06] hover:bg-white/[0.1] text-white/80 border-white/[0.08]"
            }`}
          >
            {startupPoseSaved ? "Saved as startup" : "Save as startup"}
          </button>
        </div>
      </CalibrationStep>

      {/* Footer — minor utilities */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.05] bg-white/[0.015]">
        <button
          onClick={onToggleRobotSync}
          disabled={pairingMode}
          className={`text-[10px] font-medium transition-colors px-2 py-1 rounded-md ${
            pairingMode
              ? "text-white/25 cursor-not-allowed"
              : robotCommandEnabled
                ? "text-amber-300/80 hover:text-amber-300 hover:bg-amber-500/10"
                : "text-emerald-300/80 hover:text-emerald-300 hover:bg-emerald-500/10"
          }`}
        >
          {robotCommandEnabled ? "● Live sync to robot" : "○ 3D-only (robot frozen)"}
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onResetPose}
            className="text-[10px] text-white/35 hover:text-white/65 px-2 py-1 rounded-md transition-colors"
            title="Reset 3D pose to startup"
          >
            Reset pose
          </button>
          <button
            onClick={onResetOffsets}
            className="text-[10px] text-white/35 hover:text-white/65 px-2 py-1 rounded-md transition-colors"
            title="Clear visual alignment offsets"
          >
            Reset offsets
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 border-t border-red-500/20 bg-red-500/10 text-[10px] text-red-300/90">
          {error}
        </div>
      )}
    </div>
  );
}

function CalibrationStep({
  index,
  title,
  description,
  active,
  last,
  children,
}: {
  index: number;
  title: string;
  description: string;
  active?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative px-4 py-3 ${last ? "" : "border-b border-white/[0.04]"} transition-colors ${active ? "bg-blue-500/[0.07]" : ""}`}>
      {active && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400/0 via-blue-400/70 to-blue-400/0" aria-hidden />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
            active
              ? "bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/40"
              : "bg-white/[0.06] text-white/45"
          }`}
        >
          {index}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-[11px] font-medium text-white/85 leading-tight">{title}</p>
          <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{description}</p>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function CameraSection() {
  return (
    <div className="space-y-5">
      <CameraFeed />
      <div className="pt-4 border-t border-white/[0.06]">
        <span className="text-[10px] font-medium text-white/30 uppercase tracking-wider block mb-3">
          Settings
        </span>
        <CameraControls />
      </div>
    </div>
  );
}

export default function ControlsTab() {
  const [activeSection, setActiveSection] = useState<ControlsSection>("motors");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const savePose = usePoseStore((s) => s.savePose);

  return (
    <div className="flex flex-col h-full bg-[#111118]">
      {/* ── Tab Bar (pill style) ─────────────────────────────── */}
      <div className="flex items-center justify-center py-3 flex-shrink-0">
        <Navbar
          items={TABS}
          activeId={activeSection}
          onChange={setActiveSection}
        />
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-xl mx-auto px-5 pb-5">
          {activeSection === "motors" && <MotorsSection />}
          {activeSection === "poses" && <PosePanel onSavePose={() => setSaveDialogOpen(true)} />}
          {activeSection === "camera" && <CameraSection />}
        </div>
      </div>

      {/* Save pose dialog */}
      <SavePoseDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={(name) => savePose(name)}
      />
    </div>
  );
}
