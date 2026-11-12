import { useState, useEffect } from "react";
import { usePoseStore } from "../../stores/poseStore";
import {
  usePoseWorkflowStore,
  type PoseWorkflow,
  type WorkflowStep,
} from "../../stores/poseWorkflowStore";

function WorkflowStepItem({
  step,
  index,
  workflowId,
  isActive,
  totalSteps,
}: {
  step: WorkflowStep;
  index: number;
  workflowId: string;
  isActive: boolean;
  totalSteps: number;
}) {
  const { removeStep, updateStep, reorderSteps } = usePoseWorkflowStore();
  const applyPose = usePoseStore((s) => s.applyPose);
  const poses = usePoseStore((s) => s.poses);

  const pose = poses.find((p) => p.id === step.poseId);

  return (
    <div
      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isActive
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]"
      }`}
    >
      {/* Step number */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/50">
        {index + 1}
      </div>

      {/* Pose name */}
      <div className="flex-1 min-w-0">
        <button
          onClick={() => pose && applyPose(pose)}
          className="text-xs text-white/70 hover:text-white/90 font-medium truncate block w-full text-left"
          title={`Preview: ${step.poseName}`}
        >
          {step.poseName}
        </button>
        <div className="flex items-center gap-3 mt-1">
          <label className="flex items-center gap-1 text-[10px] text-white/30">
            Delay
            <input
              type="number"
              min={0}
              max={30000}
              step={100}
              value={step.delayMs}
              onChange={(e) =>
                updateStep(workflowId, step.id, {
                  delayMs: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              className="w-16 bg-white/5 text-white/70 text-[10px] rounded px-1.5 py-0.5 border border-white/10 focus:border-white/30 focus:outline-none"
            />
            ms
          </label>
        </div>
      </div>

      {/* Reorder + delete */}
      <div className="flex flex-col gap-0.5">
        {index > 0 && (
          <button
            onClick={() => reorderSteps(workflowId, index, index - 1)}
            className="text-white/20 hover:text-white/50 transition-colors"
            title="Move up"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
        {index < totalSteps - 1 && (
          <button
            onClick={() => reorderSteps(workflowId, index, index + 1)}
            className="text-white/20 hover:text-white/50 transition-colors"
            title="Move down"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      <button
        onClick={() => removeStep(workflowId, step.id)}
        className="text-white/15 hover:text-red-400 transition-colors"
        title="Remove step"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function WorkflowEditor({ workflow }: { workflow: PoseWorkflow }) {
  const { addStep, toggleLoop, play, stop, isPlaying, currentStepIndex } =
    usePoseWorkflowStore();
  const poses = usePoseStore((s) => s.poses);
  const [showPosePicker, setShowPosePicker] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              onClick={() => play(workflow.id)}
              disabled={workflow.steps.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          ) : (
            <button
              onClick={stop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
              Stop
            </button>
          )}

          <button
            onClick={() => toggleLoop(workflow.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              workflow.loop
                ? "bg-blue-500/15 text-blue-400"
                : "bg-white/5 text-white/30 hover:text-white/50"
            }`}
            title={workflow.loop ? "Looping enabled" : "Enable loop"}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M16.023 9.348l3.17-3.17" />
            </svg>
            Loop
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30">
            {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowPosePicker(!showPosePicker)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Pose
          </button>
        </div>
      </div>

      {/* Pose picker dropdown */}
      {showPosePicker && (
        <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
            Select a pose to add
          </div>
          {poses.length === 0 ? (
            <div className="text-[10px] text-white/20 py-2">
              No poses saved. Save poses in the 3D view first.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto scrollbar-thin">
              {poses.map((pose) => (
                <button
                  key={pose.id}
                  onClick={() => {
                    addStep(workflow.id, pose);
                    setShowPosePicker(false);
                  }}
                  className="text-left px-2.5 py-1.5 rounded-md text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors truncate"
                >
                  {pose.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 scrollbar-thin">
        {workflow.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              className="w-12 h-12 text-white/10 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
              />
            </svg>
            <p className="text-xs text-white/25">No steps yet</p>
            <p className="text-[10px] text-white/15 mt-1">
              Click "Add Pose" to build a sequence
            </p>
          </div>
        ) : (
          workflow.steps.map((step, i) => (
            <WorkflowStepItem
              key={step.id}
              step={step}
              index={i}
              workflowId={workflow.id}
              isActive={isPlaying && currentStepIndex === i}
              totalSteps={workflow.steps.length}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function PoseWorkflowTab() {
  const {
    workflows,
    activeWorkflowId,
    setActiveWorkflow,
    createWorkflow,
    deleteWorkflow,
    renameWorkflow,
  } = usePoseWorkflowStore();
  const fetchPoses = usePoseStore((s) => s.fetchPoses);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    fetchPoses();
  }, [fetchPoses]);

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId);

  const handleCreate = () => {
    const name = newName.trim() || `Workflow ${workflows.length + 1}`;
    createWorkflow(name);
    setNewName("");
  };

  return (
    <div className="flex h-full bg-[#0a0a0a]">
      {/* Sidebar: workflow list */}
      <div className="w-56 border-r border-white/[0.06] flex flex-col">
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <h2 className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-2">
            Workflows
          </h2>
          <div className="flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New workflow..."
              className="flex-1 bg-white/5 text-white/80 text-[11px] rounded-md px-2 py-1.5 border border-white/10 focus:border-white/30 focus:outline-none placeholder:text-white/20"
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
              title="Create workflow"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {workflows.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[10px] text-white/20">No workflows yet</p>
            </div>
          ) : (
            workflows.map((wf) => (
              <div
                key={wf.id}
                className={`group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors ${
                  activeWorkflowId === wf.id
                    ? "bg-white/[0.08] text-white/80"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/60"
                }`}
                onClick={() => setActiveWorkflow(wf.id)}
              >
                {editingId === wf.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                      if (editName.trim()) renameWorkflow(wf.id, editName.trim());
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editName.trim()) renameWorkflow(wf.id, editName.trim());
                        setEditingId(null);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-white/5 text-white/80 text-xs rounded px-1.5 py-0.5 border border-white/20 focus:outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingId(wf.id);
                      setEditName(wf.name);
                    }}
                  >
                    {wf.name}
                  </span>
                )}
                <span className="text-[10px] text-white/20">
                  {wf.steps.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWorkflow(wf.id);
                  }}
                  className="text-white/0 group-hover:text-white/20 hover:!text-red-400 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main: workflow editor */}
      {activeWorkflow ? (
        <WorkflowEditor workflow={activeWorkflow} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg
              className="w-16 h-16 text-white/5 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={0.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
              />
            </svg>
            <p className="text-sm text-white/20">Select or create a workflow</p>
            <p className="text-[10px] text-white/10 mt-1">
              Build pose sequences that play automatically
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
