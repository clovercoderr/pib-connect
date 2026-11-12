import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Scene } from "./components/viewer/Scene";
import { PoseCalibrationModal } from "./components/controls/PoseCalibrationModal";
import { BlocklyEditor } from "./components/editor/BlocklyEditor";
import { PythonEditor } from "./components/editor/PythonEditor";
import { ProjectBrowser } from "./components/project/ProjectBrowser";
import AITab from "./components/ai/AITab";
import ControlsTab from "./components/controls/ControlsTab";
import PoseWorkflowTab from "./components/poses/PoseWorkflowTab";
import { useBackendConnectionStore } from "./stores/backendConnectionStore";
import { useViewStore, VIEW_MODES, VIEW_PRESETS } from "./stores/viewStore";
import { useAppStore, type AppTab } from "./stores/appStore";
import { useProgramStore } from "./stores/programStore";
import { useProjectStore } from "./stores/projectStore";
import { usePoseStore } from "./stores/poseStore";
import { useSimulatorStore } from "./stores/simulatorStore";
import { startRobotStateSync, stopRobotStateSync, useRobotStore } from "./stores/robotStore";
import { useExecutionTargetStore, type ExecutionTarget } from "./stores/executionTargetStore";
import { healthApi } from "./lib/pibApi";
import { disconnectRosBridge, initRosBridge } from "./lib/rosApi";
import { loadHomePose, setHomePoseScope } from "./lib/calibration";
import { Navbar } from "./components/ui/Navbar";
import { Button } from "./components/ui/Button";
import { IconButton } from "./components/ui/IconButton";
import { ToastContainer } from "./components/ui/Toast";

function ThreeDView({ showViewModes = true }: { showViewModes?: boolean }) {
  const viewMode = useViewStore((state) => state.viewMode);
  const setViewMode = useViewStore((state) => state.setViewMode);
  const zoomInCamera = useViewStore((state) => state.zoomInCamera);
  const zoomOutCamera = useViewStore((state) => state.zoomOutCamera);
  const resetCameraZoom = useViewStore((state) => state.resetCameraZoom);
  const resetPositions = useRobotStore((state) => state.resetPositions);

  return (
    <div className="relative w-full h-full">
      <Scene visible />

      <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-1.5">
        <IconButton tone="glass" size="md" onClick={zoomInCamera} aria-label="Zoom in">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
        <IconButton tone="glass" size="md" onClick={zoomOutCamera} aria-label="Zoom out">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </IconButton>
        <IconButton tone="glass" size="md" onClick={resetCameraZoom} aria-label="Reset zoom">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 20v-5h-5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 9a8 8 0 0 0-14.6-3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 15a8 8 0 0 0 14.6 3" />
          </svg>
        </IconButton>
        <IconButton tone="glass" size="md" onClick={resetPositions} aria-label="Robot reset">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="6.5" y="8" width="11" height="9" rx="2" />
            <path strokeLinecap="round" d="M9 8V6.5" />
            <path strokeLinecap="round" d="M15 8V6.5" />
            <circle cx="10" cy="12.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="14" cy="12.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </IconButton>
      </div>

      {showViewModes && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <Navbar
            items={VIEW_MODES.map((mode) => ({
              id: mode,
              label: VIEW_PRESETS[mode].label,
            }))}
            activeId={viewMode}
            onChange={setViewMode}
          />
        </div>
      )}
    </div>
  );
}

function OutputPanel({ className = "" }: { className?: string }) {
  const runOutput = useProgramStore((s) => s.runOutput);
  const simOutput = useSimulatorStore((s) => s.output);
  const isRunning = useProgramStore((s) => s.isRunning);
  const clearOutput = useProgramStore((s) => s.clearOutput);
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [simOutput, runOutput]);

  useEffect(() => {
    if (isRunning) setMinimized(false);
  }, [isRunning]);

  const hasOutput = runOutput || simOutput.length > 0;
  if (!hasOutput && !isRunning) return null;

  const displayOutput = simOutput.length > 0 ? simOutput.join("\n") : runOutput;

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-[200] bg-[#0a0a12]/95 backdrop-blur-xl border-t border-white/[0.08] transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${minimized ? 'h-9' : 'h-52'} ${className}`}>
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/[0.02] select-none"
        onClick={() => setMinimized(!minimized)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">Console</span>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/80 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasOutput && !isRunning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearOutput();
                useSimulatorStore.setState({ output: [] });
              }}
              className="text-[10px] text-white/25 hover:text-white/50 transition-colors px-1.5 py-0.5"
            >
              Clear
            </button>
          )}
          <svg
            className={`w-3 h-3 text-white/30 transition-transform duration-200 ${minimized ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {!minimized && (
        <div ref={scrollRef} className="px-4 pb-3 h-[calc(100%-36px)] overflow-auto scrollbar-thin">
          <pre className="text-[11px] font-mono leading-relaxed text-white/45 whitespace-pre-wrap">
            {displayOutput || "Ready to run..."}
          </pre>
        </div>
      )}
    </div>
  );
}

function ExecutionTargetSelector({ target, onChange }: { target: ExecutionTarget; onChange: (target: ExecutionTarget) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-[#1a1a24]/80 backdrop-blur-xl rounded-full p-0.5 border border-white/[0.06]">
      <button
        onClick={() => onChange("simulator")}
        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-[background-color,color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
          target === "simulator"
            ? "bg-blue-500/20 text-blue-400 shadow-sm"
            : "text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
        }`}
        title="Run in Simulator"
        aria-pressed={target === "simulator"}
      >
        Sim
      </button>
      <button
        onClick={() => onChange("robot")}
        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-[background-color,color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
          target === "robot"
            ? "bg-amber-500/20 text-amber-400 shadow-sm"
            : "text-white/35 hover:text-white/55 hover:bg-white/[0.04]"
        }`}
        title="Run on Robot"
        aria-pressed={target === "robot"}
      >
        Robot
      </button>
    </div>
  );
}

function EditorWithConsole({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 overflow-hidden">{children}</div>
      <OutputPanel />
    </div>
  );
}

// Left sidebar navigation items
const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: React.ReactNode; editorOnly?: boolean }> = [
  {
    id: "3d-view",
    label: "Live",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
  },
  {
    id: "controls",
    label: "Controls",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    id: "poses",
    label: "Poses",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
  },
  {
    id: "no-code",
    label: "Blocks",
    editorOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
      </svg>
    ),
  },
  {
    id: "python",
    label: "Python",
    editorOnly: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
];

export default function App() {
  const [homePoseOpen, setHomePoseOpen] = useState(false);
  const [projectBrowserOpen, setProjectBrowserOpen] = useState(false);

  const setBackendStatus = useBackendConnectionStore((state) => state.setStatus);
  const backendStatus = useBackendConnectionStore((state) => state.status);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const splitView = useAppStore((s) => s.splitView);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const toggleSplitView = useAppStore((s) => s.toggleSplitView);

  const executionTarget = useExecutionTargetStore((s) => s.target);
  const setExecutionTarget = useExecutionTargetStore((s) => s.setTarget);

  const {
    runProgram,
    runPythonCode,
    stopProgram,
    isRunning,
    setGeneratedPython,
    pythonCode,
    setPythonCode,
    generatedPython
  } = useProgramStore();

  const {
    currentProject,
    currentFilePath,
    newProject,
    saveProjectToFile,
    loadProjectFromFile,
  } = useProjectStore();
  const setPoseProjectScope = usePoseStore((s) => s.setProjectScope);

  const projectType = currentProject?.projectType || null;
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = currentProject?.name ?? null;
    setPoseProjectScope(scope);

    setHomePoseScope(scope);
    useRobotStore.getState().applyLoadedHomePose(loadHomePose());
  }, [currentProject?.name, setPoseProjectScope]);

  useEffect(() => {
    if (!currentProject) {
      setProjectBrowserOpen(true);
    }
  }, [currentProject]);

  // Cross-window calibration sync. The Settings window is a separate webview
  // with its own Zustand store; writes to localStorage don't propagate to
  // this store on their own. When INV / 180° / visual-offset overrides
  // change in another window, refresh local positions so centidegreesToJointRadians
  // re-runs with the new override values and the 3D model picks them up.
  useEffect(() => {
    const OVERRIDE_KEYS = new Set([
      "robotJointInvertOverrides",
      "robotJointVisualOffsetOverrides",
      "robotJointHalfTurnOverrides",
    ]);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !OVERRIDE_KEYS.has(e.key)) return;
      const positions = useRobotStore.getState().jointPositions;
      // Touching the store with the same values forces subscribers to re-run.
      useRobotStore.getState().setAllPositionsLocal({ ...positions });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (activeTab === "python" && pythonCode) {
      localStorage.setItem("pib_autosave_python", pythonCode);
    }
  }, [pythonCode, activeTab]);

  useEffect(() => {
    const autosaved = localStorage.getItem("pib_autosave_python");
    if (autosaved) {
      setPythonCode(autosaved);
    }
  }, []);

  const openSettingsWindow = useCallback(() => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      invoke("open_settings_window").catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<string>("menu-event", async (event) => {
      const id = event.payload;

      switch (id) {
        case "view_3d":
          if (projectType !== "live") setActiveTab("3d-view");
          break;
        case "view_nocode":
          if (projectType !== "live") setActiveTab("no-code");
          break;
        case "view_python":
          if (projectType !== "live") setActiveTab("python");
          break;
        case "toggle_split":
          if (projectType !== "live" && activeTab !== "3d-view") toggleSplitView();
          break;
        case "run_program":
          runProgram();
          break;
        case "stop_program":
          stopProgram();
          break;
        case "settings":
          openSettingsWindow();
          break;
        case "docs":
          window.open("https://docs.pibconnect.com", "_blank");
          break;
        case "new_project":
          setProjectBrowserOpen(true);
          break;
        case "open_project":
          try {
            const selected = await open({
              multiple: false,
              filters: [{ name: "PIB Project", extensions: ["pib", "pibconnect", "json"] }],
            });
            if (selected && typeof selected === "string") {
              const content = await readTextFile(selected);
              loadProjectFromFile(content, selected);
            }
          } catch (e) {
            console.error("Failed to open project:", e);
          }
          break;
        case "save_project":
          try {
            let filePath = currentFilePath;
            if (!filePath) {
              const selected = await save({
                defaultPath: `${currentProject?.name || "project"}.pib`,
                filters: [{ name: "PIB Project", extensions: ["pib"] }],
              });
              if (selected) filePath = selected;
            }
            if (filePath) {
              const json = saveProjectToFile();
              if (json) {
                await writeTextFile(filePath, json);
                useProjectStore.getState().setCurrentFilePath(filePath);
              }
            }
          } catch (e) {
            console.error("Failed to save project:", e);
          }
          break;
        case "close":
          useProjectStore.setState({ currentProject: null, currentFilePath: null });
          setProjectBrowserOpen(true);
          break;
        case "quit":
          getCurrentWindow().close();
          break;
        case "about":
          openSettingsWindow();
          break;
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [setActiveTab, toggleSplitView, runProgram, stopProgram, currentProject, currentFilePath, saveProjectToFile, loadProjectFromFile, newProject, projectType, openSettingsWindow, activeTab]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<{ name: string; type: "live" | "code" }>("create-project", (event) => {
      const { name, type } = event.payload;
      newProject(name, type);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [newProject]);

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = contentRef.current;
    if (!container) return;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      setSplitRatio(ratio);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setSplitRatio]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (projectType !== "live") {
        const TAB_MAP: Record<string, AppTab> = {
          "1": "3d-view",
          "2": "controls",
          "3": "poses",
          "4": "no-code",
          "5": "python",
          "6": "ai",
        };
        if (TAB_MAP[e.key]) {
          e.preventDefault();
          setActiveTab(TAB_MAP[e.key]);
        }
      }
      if (e.key === "\\") {
        e.preventDefault();
        if (useAppStore.getState().activeTab !== "3d-view") {
          toggleSplitView();
        }
      }
      if (e.key === ",") {
        e.preventDefault();
        openSettingsWindow();
      }
    },
    [setActiveTab, toggleSplitView, projectType, openSettingsWindow]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const checkBackend = async () => {
      const result = await healthApi.checkHealth();
      setBackendStatus(result.success ? "connected" : "error");
    };
    checkBackend();
    const interval = setInterval(checkBackend, 30000);
    return () => clearInterval(interval);
  }, [setBackendStatus]);

  useEffect(() => {
    if (backendStatus !== "connected") {
      stopRobotStateSync();
      disconnectRosBridge();
      return;
    }

    initRosBridge();
    startRobotStateSync();
    void useRobotStore.getState().fetchCurrentPositions({ preserveLocalPose: true });

    return () => {
      stopRobotStateSync();
      disconnectRosBridge();
    };
  }, [backendStatus]);

  const is3DView = activeTab === "3d-view";
  const isControls = activeTab === "controls";
  const isNoCode = activeTab === "no-code";
  const isPython = activeTab === "python";
  const isAI = activeTab === "ai";
  const isPoses = activeTab === "poses";
  const isEditorTab = isNoCode || isPython;

  // Whether to show the 3D view (always on 3d-view tab, or when split view is active)
  const show3D = is3DView || splitView;

  const getPythonCode = useCallback(() => {
    if (generatedPython && generatedPython !== pythonCode) return generatedPython;
    return pythonCode;
  }, [generatedPython, pythonCode]);

  const handlePythonChange = useCallback((code: string) => { setPythonCode(code); }, [setPythonCode]);
  const handleBlocklyChange = useCallback((python: string) => {
    setGeneratedPython(python);
    setPythonCode(python);
  }, [setGeneratedPython, setPythonCode]);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.editorOnly || projectType !== "live"
  );

  // Render the active tab content (everything except 3d-view, which is always the ThreeDView)
  const renderTabContent = () => {
    if (is3DView) return null;
    if (isControls) return <ControlsTab />;
    if (isPoses) return <PoseWorkflowTab />;
    if (isNoCode) return (
      <EditorWithConsole>
        <BlocklyEditor onCodeChange={handleBlocklyChange} />
      </EditorWithConsole>
    );
    if (isPython) return (
      <EditorWithConsole>
        <PythonEditor code={getPythonCode()} onChange={handlePythonChange} />
      </EditorWithConsole>
    );
    if (isAI) return <AITab />;
    return null;
  };

  return (
    <div className="h-screen w-screen bg-[#111118] overflow-hidden flex flex-col">
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between px-3 h-11 bg-[#111118] flex-shrink-0" data-tauri-drag-region>
        {/* Left: Project name + connection */}
        <div className="flex items-center gap-2.5 min-w-0">
          {currentProject ? (
            <button
              onClick={() => setProjectBrowserOpen(true)}
              className="text-[11px] text-white/40 hover:text-white/65 transition-colors font-medium truncate"
            >
              {currentProject.name}
            </button>
          ) : (
            <button
              onClick={() => setProjectBrowserOpen(true)}
              className="text-[11px] text-blue-400/70 hover:text-blue-300 transition-colors font-medium"
            >
              Open Project
            </button>
          )}
          {projectType !== "live" && (
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                backendStatus === "connected"
                  ? "bg-emerald-400"
                  : backendStatus === "connecting"
                    ? "bg-yellow-400 animate-pulse"
                    : "bg-red-400/60"
              }`}
              title={`Backend: ${backendStatus}`}
            />
          )}
        </div>

        {/* Center: Navigation pill */}
        {projectType !== "live" && (
          <Navbar
            centered
            items={visibleNavItems.map(item => ({
              id: item.id,
              label: item.label,
            }))}
            activeId={activeTab}
            onChange={setActiveTab}
          />
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {isEditorTab && (
            <>
              <ExecutionTargetSelector target={executionTarget} onChange={setExecutionTarget} />
              <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
              {!isRunning ? (
                <Button
                  onClick={isPython ? runPythonCode : runProgram}
                  variant="primary"
                  size="sm"
                  className="rounded-full !px-3"
                  icon={<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                >
                  Run
                </Button>
              ) : (
                <Button
                  onClick={stopProgram}
                  variant="danger"
                  size="sm"
                  className="rounded-full !px-3"
                  icon={<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>}
                >
                  Stop
                </Button>
              )}
              <div className="w-px h-4 bg-white/[0.06] mx-0.5" />
            </>
          )}

          {!is3DView && projectType !== "live" && (
            <IconButton
              tone={splitView ? "toggle-on" : "ghost"}
              size="sm"
              onClick={toggleSplitView}
              title={splitView ? "Exit split view" : "Split view"}
              aria-label={splitView ? "Exit split view" : "Split view"}
              aria-pressed={splitView}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-15A1.5 1.5 0 0 0 3 6v12a1.5 1.5 0 0 0 1.5 1.5Z" />
              </svg>
            </IconButton>
          )}

          {projectType !== "live" && (
            <IconButton
              tone="ghost"
              size="sm"
              onClick={openSettingsWindow}
              title="Settings"
              aria-label="Settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </IconButton>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1 min-h-0 relative overflow-hidden">
        {projectType === "live" ? (
          /* Live mode: just 3D view */
          <ThreeDView />
        ) : (
          <>
            {/* 3D View Layer: always mounted, stable position in tree */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: is3DView
                  ? '100%'
                  : splitView
                    ? `${splitRatio * 100}%`
                    : '100%',
                visibility: show3D ? 'visible' : 'hidden',
                pointerEvents: show3D ? 'auto' : 'none',
              }}
            >
              <ThreeDView showViewModes={show3D} />
            </div>

            {/* Split Divider */}
            {splitView && !is3DView && (
              <div
                className="absolute inset-y-0 z-20 cursor-col-resize group"
                style={{ left: `${splitRatio * 100}%`, width: '3px' }}
                onMouseDown={handleSplitDrag}
              >
                <div className="absolute inset-0 bg-white/[0.06] group-hover:bg-white/[0.15] transition-colors" />
                <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
              </div>
            )}

            {/* Tab Content Panel */}
            {!is3DView && (
              <div
                key={activeTab}
                className="absolute inset-y-0 right-0 overflow-hidden anim-fade-in-up"
                style={{
                  left: splitView ? `calc(${splitRatio * 100}% + 3px)` : '0',
                }}
              >
                {renderTabContent()}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      <ProjectBrowser
        open={projectBrowserOpen}
        onClose={() => setProjectBrowserOpen(false)}
      />

      <PoseCalibrationModal
        open={homePoseOpen}
        onClose={() => setHomePoseOpen(false)}
      />

      <ToastContainer />
    </div>
  );
}
