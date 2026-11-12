import { useEffect } from "react";
import { usePoseStore } from "../../stores/poseStore";

interface PosePanelProps {
  onSavePose: () => void;
}

export function PosePanel({ onSavePose }: PosePanelProps) {
  const { poses, isLoading, fetchPoses, applyPose, deletePose } =
    usePoseStore();

  useEffect(() => {
    fetchPoses();
  }, [fetchPoses]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
          Poses
        </h3>
        <button
          onClick={onSavePose}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Save Pose
        </button>
      </div>

      {isLoading && (
        <div className="text-[10px] text-white/25 py-2">Loading poses...</div>
      )}

      {!isLoading && poses.length === 0 && (
        <div className="text-[10px] text-white/20 py-2 text-center">
          No poses saved yet
        </div>
      )}

      <div className="space-y-1">
        {poses.map((pose) => (
          <div
            key={pose.id}
            className="flex items-center gap-2 group rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            <button
              onClick={() => applyPose(pose)}
              className="flex-1 text-left px-2.5 py-1.5 text-xs text-white/50 hover:text-white/80 transition-colors truncate"
              title={`Apply "${pose.name}"`}
            >
              {pose.name}
            </button>
            <button
              onClick={() => deletePose(pose.id)}
              className="px-2 py-1.5 text-white/0 group-hover:text-white/25 hover:!text-red-400 transition-colors"
              title="Delete pose"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
