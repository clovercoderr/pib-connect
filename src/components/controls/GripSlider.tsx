import { JOINT_CONFIGS, DEFAULT_RANGE_MIN, DEFAULT_RANGE_MAX } from "../../lib/jointConfig";
import { useRobotStore } from "../../stores/robotStore";

export function GripSlider({
  side,
  localOnly = false,
}: {
  side: "right" | "left";
  localOnly?: boolean;
}) {
  const group = `${side}_hand`;
  const fingerJoints = JOINT_CONFIGS.filter(
    (j) => j.group === group && !j.id.includes("thumb"),
  );
  const setJointPositionLocal = useRobotStore((s) => s.setJointPositionLocal);
  const syncJointSelectionToRobot = useRobotStore((s) => s.syncJointSelectionToRobot);
  const jointPositions = useRobotStore((s) => s.jointPositions);
  const robotCommandEnabled = useRobotStore((s) => s.robotCommandEnabled);
  const pairingMode = useRobotStore((s) => s.pairingMode);

  const min = DEFAULT_RANGE_MIN;
  const max = DEFAULT_RANGE_MAX;

  const avg =
    fingerJoints.length > 0
      ? Math.round(
          fingerJoints.reduce(
            (sum, j) => sum + (jointPositions[j.id] ?? j.defaultCentidegrees),
            0,
          ) / fingerJoints.length,
        )
      : 0;

  const fillPercent = max > min ? ((avg - min) / (max - min)) * 100 : 50;
  const degrees = (avg / 100).toFixed(1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (pairingMode) return;
    const value = parseInt(e.target.value, 10);
    fingerJoints.forEach((j) => setJointPositionLocal(j.id, value));
  };

  const commitToRobot = () => {
    if (localOnly || !robotCommandEnabled || pairingMode) return;
    syncJointSelectionToRobot(fingerJoints.map((joint) => joint.id));
  };

  return (
    <div className={`rounded-xl border border-emerald-400/10 bg-emerald-400/[0.06] px-2.5 py-2 ${pairingMode ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-emerald-100/88">All Fingers</span>
        <span className="text-[11px] text-emerald-100/55 font-mono tabular-nums">
          {degrees}&deg;
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={100}
        value={avg}
        onChange={handleChange}
        onPointerUp={commitToRobot}
        onBlur={commitToRobot}
        onKeyUp={commitToRobot}
        aria-label={`${side} hand all fingers`}
        className="slider slider-large"
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.25) ${fillPercent}%, rgba(255,255,255,0.08) ${fillPercent}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}
