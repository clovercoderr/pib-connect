import { useState } from "react";
import { emit } from "@tauri-apps/api/event";

type ProjectType = "live" | "code";

export default function NewProjectWindow() {
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("code");

  const handleCreate = () => {
    if (name.trim() && projectType) {
      emit("create-project", { name: name.trim() || "Untitled", type: projectType });
      window.close();
    }
  };

  const handleCancel = () => {
    window.close();
  };

  return (
    <div className="h-screen w-screen bg-[#16161f] flex flex-col">
      {/* Title bar */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-white/[0.06]" data-tauri-drag-region>
        <span className="text-sm font-medium text-white/80">New Project</span>
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-6">
        {/* Project name */}
        <div className="mb-6">
          <label className="text-xs font-medium text-white/50 mb-2 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-colors"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>

        {/* Project type */}
        <div className="flex-1">
          <label className="text-xs font-medium text-white/50 mb-2 block">Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setProjectType("code")}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-colors ${
                projectType === "code"
                  ? "bg-blue-500/10 border-blue-500/30"
                  : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                projectType === "code" ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.04] text-white/40"
              }`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-sm font-medium ${projectType === "code" ? "text-blue-400" : "text-white/70"}`}>
                  Blocks + Code
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">Visual editor</div>
              </div>
            </button>

            <button
              onClick={() => setProjectType("live")}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-colors ${
                projectType === "live"
                  ? "bg-blue-500/10 border-blue-500/30"
                  : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                projectType === "live" ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.04] text-white/40"
              }`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-sm font-medium ${projectType === "live" ? "text-blue-400" : "text-white/70"}`}>
                  Live Control
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">Direct control</div>
              </div>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white/50 hover:text-white/80 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 px-4 py-2.5 text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
