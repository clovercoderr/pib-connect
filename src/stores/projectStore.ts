import { create } from "zustand";
import { useProgramStore } from "./programStore";
import { usePoseStore } from "./poseStore";
import { poseApi, programApi } from "../lib/pibApi";

export interface PibProject {
  version: 1;
  name: string;
  projectType: "live" | "code";
  createdAt: string;
  updatedAt: string;
  poses: Array<{ name: string; motorPositions: Record<string, number> }>;
  blocklyWorkspace: object | null;
  pythonCode: string;
}

interface ProjectListEntry {
  name: string;
  projectType: "live" | "code";
  updatedAt: string;
}

interface ProjectState {
  currentProject: PibProject | null;
  currentFilePath: string | null;
  projectList: ProjectListEntry[];
  isDirty: boolean;

  newProject: (name: string, projectType?: "live" | "code") => void;
  saveProject: () => void;
  saveProjectToFile: () => string | null;
  loadProjectFromFile: (json: string, filePath?: string) => boolean;
  loadProject: (name: string) => void;
  deleteProject: (name: string) => void;
  listProjects: () => void;
  exportProject: () => string | null;
  importProject: (json: string) => boolean;
  markDirty: () => void;
  setCurrentFilePath: (path: string | null) => void;
  syncToBackend: () => Promise<void>;
}

const STORAGE_PREFIX = "pib_project_";
const PROJECT_LIST_KEY = "pib_project_list";

function getProjectList(): ProjectListEntry[] {
  try {
    const raw = localStorage.getItem(PROJECT_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjectList(list: ProjectListEntry[]) {
  localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list));
}

function createEmptyProject(name: string, projectType: "live" | "code" = "code"): PibProject {
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    projectType,
    createdAt: now,
    updatedAt: now,
    poses: [],
    blocklyWorkspace: null,
    pythonCode: `from pib_sdk.kinematics import fk, ik
import time

# Your pib program here
`,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  currentFilePath: null,
  projectList: getProjectList(),
  isDirty: false,

  newProject: (name: string, projectType: "live" | "code" = "code") => {
    const project = createEmptyProject(name, projectType);
    set({ currentProject: project, currentFilePath: null, isDirty: false });
    usePoseStore.getState().setProjectScope(project.name);
    usePoseStore.getState().setPoses([]);

    useProgramStore.getState().setBlocklyJson(null);
    useProgramStore.getState().setGeneratedPython("");
    useProgramStore.getState().setPythonCode(project.pythonCode);
  },

  saveProject: () => {
    // Legacy function - saveProjectToFile is used for file-based saving
    const { currentProject } = get();
    if (!currentProject) return;

    const programState = useProgramStore.getState();
    const poseState = usePoseStore.getState();

    const updated: PibProject = {
      ...currentProject,
      updatedAt: new Date().toISOString(),
      blocklyWorkspace: programState.blocklyJson,
      pythonCode: programState.pythonCode,
      poses: poseState.poses.map((p) => ({
        name: p.name,
        motorPositions: p.motorPositions,
      })),
    };

    localStorage.setItem(
      STORAGE_PREFIX + updated.name,
      JSON.stringify(updated)
    );

    const list = getProjectList();
    const existing = list.findIndex((p) => p.name === updated.name);
    const entry: ProjectListEntry = { name: updated.name, projectType: updated.projectType, updatedAt: updated.updatedAt };
    if (existing >= 0) {
      list[existing] = entry;
    } else {
      list.push(entry);
    }
    saveProjectList(list);

    set({ currentProject: updated, projectList: list, isDirty: false });
  },

  saveProjectToFile: () => {
    const { currentProject } = get();
    if (!currentProject) return null;

    const programState = useProgramStore.getState();
    const poseState = usePoseStore.getState();

    const exportData: PibProject = {
      ...currentProject,
      updatedAt: new Date().toISOString(),
      blocklyWorkspace: programState.blocklyJson,
      pythonCode: programState.pythonCode,
      poses: poseState.poses.map((p) => ({
        name: p.name,
        motorPositions: p.motorPositions,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  },

  loadProjectFromFile: (json: string, filePath?: string) => {
    try {
      const project: PibProject = JSON.parse(json);
      if (project.version !== 1 || !project.name) return false;

      if (!project.projectType) {
        project.projectType = "code";
      }

      set({ currentProject: project, currentFilePath: filePath || null, isDirty: false });
      usePoseStore.getState().setProjectScope(project.name);

      const programStore = useProgramStore.getState();
      programStore.setBlocklyJson(project.blocklyWorkspace);
      programStore.setPythonCode(project.pythonCode);
      programStore.setGeneratedPython("");

      // Restore poses from the project into the pose store
      if (project.poses?.length) {
        const posesWithIds = project.poses.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          motorPositions: p.motorPositions,
        }));
        usePoseStore.getState().setPoses(posesWithIds);
      } else {
        usePoseStore.getState().setPoses([]);
      }

      localStorage.setItem(
        STORAGE_PREFIX + project.name,
        JSON.stringify(project)
      );

      const list = getProjectList();
      const existing = list.findIndex((p) => p.name === project.name);
      const entry: ProjectListEntry = { name: project.name, projectType: project.projectType, updatedAt: project.updatedAt };
      if (existing >= 0) {
        list[existing] = entry;
      } else {
        list.push(entry);
      }
      saveProjectList(list);
      set({ projectList: list });

      return true;
    } catch {
      return false;
    }
  },

  loadProject: (name: string) => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + name);
      if (!raw) return;

      const project: PibProject = JSON.parse(raw);
      set({ currentProject: project, currentFilePath: null, isDirty: false });
      usePoseStore.getState().setProjectScope(project.name);

      const programStore = useProgramStore.getState();
      programStore.setBlocklyJson(project.blocklyWorkspace);
      programStore.setPythonCode(project.pythonCode);
      if (project.blocklyWorkspace) {
        programStore.setGeneratedPython("");
      }

      // Restore poses from the project into the pose store
      if (project.poses?.length) {
        const posesWithIds = project.poses.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          motorPositions: p.motorPositions,
        }));
        usePoseStore.getState().setPoses(posesWithIds);
      } else {
        usePoseStore.getState().setPoses([]);
      }
    } catch {
    }
  },

  deleteProject: (name: string) => {
    localStorage.removeItem(STORAGE_PREFIX + name);
    const list = getProjectList().filter((p) => p.name !== name);
    saveProjectList(list);

    const { currentProject } = get();
    if (currentProject?.name === name) {
      set({ currentProject: null, currentFilePath: null, projectList: list, isDirty: false });
    } else {
      set({ projectList: list });
    }
  },

  listProjects: () => {
    set({ projectList: getProjectList() });
  },

  exportProject: () => {
    const { currentProject } = get();
    if (!currentProject) return null;

    const programState = useProgramStore.getState();
    const poseState = usePoseStore.getState();

    const exportData: PibProject = {
      ...currentProject,
      updatedAt: new Date().toISOString(),
      blocklyWorkspace: programState.blocklyJson,
      pythonCode: programState.pythonCode,
      poses: poseState.poses.map((p) => ({
        name: p.name,
        motorPositions: p.motorPositions,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  },

  importProject: (json: string) => {
    try {
      const project: PibProject = JSON.parse(json);
      if (project.version !== 1 || !project.name) return false;

      set({ currentProject: project, currentFilePath: null, isDirty: false });
      usePoseStore.getState().setProjectScope(project.name);

      const programStore = useProgramStore.getState();
      programStore.setBlocklyJson(project.blocklyWorkspace);
      programStore.setPythonCode(project.pythonCode);

      // Restore poses from the project into the pose store
      if (project.poses?.length) {
        const posesWithIds = project.poses.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          motorPositions: p.motorPositions,
        }));
        usePoseStore.getState().setPoses(posesWithIds);
      } else {
        usePoseStore.getState().setPoses([]);
      }

      localStorage.setItem(
        STORAGE_PREFIX + project.name,
        JSON.stringify(project)
      );

      const list = getProjectList();
      const existing = list.findIndex((p) => p.name === project.name);
      const entry: ProjectListEntry = { name: project.name, projectType: project.projectType, updatedAt: project.updatedAt };
      if (existing >= 0) {
        list[existing] = entry;
      } else {
        list.push(entry);
      }
      saveProjectList(list);
      set({ projectList: list });

      return true;
    } catch {
      return false;
    }
  },

  markDirty: () => set({ isDirty: true }),

  setCurrentFilePath: (path: string | null) => set({ currentFilePath: path }),

  syncToBackend: async () => {
    const { currentProject } = get();
    if (!currentProject) return;

    for (const pose of currentProject.poses) {
      await poseApi.createPose({
        name: pose.name,
        motorPositions: pose.motorPositions,
      });
    }

    const code = useProgramStore.getState().pythonCode;
    if (code.trim()) {
      await programApi.createProgram({
        name: currentProject.name,
        code,
      });
    }
  },
}));
