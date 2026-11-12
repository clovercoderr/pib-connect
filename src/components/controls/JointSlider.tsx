import { useState, useRef } from "react";
import { useRobotStore } from "../../stores/robotStore";

interface JointSliderProps {
  jointId: string;
  label: string;
  localOnly?: boolean;
}

export function JointSlider({ jointId, label, localOnly = false }: JointSliderProps) {
  const position = useRobotStore(
    (state) => state.jointPositions[jointId] ?? 0,
  );
  const setJointPositionLocal = useRobotStore((state) => state.setJointPositionLocal);
  const syncJointSelectionToRobot = useRobotStore((state) => state.syncJointSelectionToRobot);
  const robotCommandEnabled = useRobotStore((state) => state.robotCommandEnabled);
  const pairingMode = useRobotStore((state) => state.pairingMode);
  const min = useRobotStore((state) => state.getMotorRange(jointId).minCentidegrees);
  const max = useRobotStore((state) => state.getMotorRange(jointId).maxCentidegrees);

  const [syncState, setSyncState] = useState<"idle" | "pending" | "synced">("idle");
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (pairingMode) return;
    const value = parseInt(e.target.value, 10);
    setJointPositionLocal(jointId, value);
    if (!localOnly && robotCommandEnabled) {
      setSyncState("pending");
    }
  };

  const commitToRobot = () => {
    if (localOnly || !robotCommandEnabled || pairingMode) return;
    syncJointSelectionToRobot([jointId]);
    setSyncState("synced");
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => setSyncState("idle"), 1200);
  };

  const fillPercent = max > min ? ((position - min) / (max - min)) * 100 : 50;
  const degrees = (position / 100).toFixed(1);

  const syncIndicator =
    syncState === "synced"
      ? "border-emerald-400/20 bg-emerald-400/[0.04]"
      : syncState === "pending"
        ? "border-amber-400/20 bg-amber-400/[0.03]"
        : "border-white/[0.07] bg-white/[0.03]";

  return (
    <div className={`rounded-xl border px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.16)] transition-[background-color,border-color,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${syncIndicator} ${pairingMode ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-white/82">{label}</span>
        <div className="flex items-center gap-1.5">
          {syncState === "synced" && (
            <svg className="w-3 h-3 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {syncState === "pending" && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse" />
          )}
          <span className="text-[11px] text-white/45 font-mono tabular-nums">
            {degrees}&deg;
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={100}
        value={position}
        onChange={handleChange}
        onPointerUp={commitToRobot}
        onBlur={commitToRobot}
        onKeyUp={commitToRobot}
        aria-label={label}
        disabled={pairingMode}
        className="slider slider-large"
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.25) ${fillPercent}%, rgba(255,255,255,0.08) ${fillPercent}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}
