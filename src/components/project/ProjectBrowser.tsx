import { useState, useEffect, useRef } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";

interface ProjectBrowserProps {
  open: boolean;
  onClose: () => void;
}

type ProjectType = "live" | "code";

export function ProjectBrowser({ open, onClose }: ProjectBrowserProps) {
  const [newName, setNewName] = useState("");
  const [newProjectType, setNewProjectType] = useState<ProjectType>("code");
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    projectList,
    currentProject,
    listProjects,
    newProject,
    loadProject,
    deleteProject,
    loadProjectFromFile,
  } = useProjectStore();

  useEffect(() => {
    if (open) {
      listProjects();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, listProjects]);

  const handleCreate = () => {
    if (newName.trim()) {
      newProject(newName.trim(), newProjectType);
      setNewName("");
      onClose();
    }
  };

  const handleLoad = (name: string) => {
    loadProject(name);
    onClose();
  };

  const handleOpenFromComputer = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "PIB Project", extensions: ["pib", "json"] },
        ],
      });
      if (selected && typeof selected === "string") {
        const content = await readTextFile(selected);
        loadProjectFromFile(content, selected);
        onClose();
      }
    } catch (e) {
      console.error("Failed to open project:", e);
    }
  };

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[420px] bg-[#1a1a24] border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <h2 className="text-sm font-medium text-white/90">Projects</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Create new */}
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New project name"
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-colors"
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setNewProjectType("code")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  newProjectType === "code"
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                    : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                Code
              </button>
              <button
                onClick={() => setNewProjectType("live")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  newProjectType === "live"
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                    : "bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                Live
              </button>
            </div>

            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="w-full px-4 py-2 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Create Project
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.04]" />

          {/* Open from computer */}
          <button
            onClick={handleOpenFromComputer}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium bg-white/[0.03] text-white/50 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.1] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Open from Computer
          </button>

          {/* Project list */}
          {projectList.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
              {projectList.map((project) => (
                <div
                  key={project.name}
                  onClick={() => handleLoad(project.name)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    currentProject?.name === project.name
                      ? "bg-blue-500/10"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentProject?.name === project.name
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-white/[0.04] text-white/40"
                  }`}>
                    {project.projectType === "live" ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/80 truncate">{project.name}</div>
                    <div className="text-[10px] text-white/30">
                      {new Date(project.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.name);
                    }}
                    className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    style={{ opacity: undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "")}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
