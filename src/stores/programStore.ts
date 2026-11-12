import { create } from "zustand";
import { programApi } from "../lib/pibApi";
import { useBackendConnectionStore } from "./backendConnectionStore";
import { useSimulatorStore } from "./simulatorStore";
import { useExecutionTargetStore } from "./executionTargetStore";

interface ProgramState {
  blocklyJson: object | null;
  generatedPython: string;
  pythonCode: string;
  isRunning: boolean;
  runOutput: string;
  backendProgramId: string | null;

  setBlocklyJson: (json: object | null) => void;
  setGeneratedPython: (code: string) => void;
  setPythonCode: (code: string) => void;
  runProgram: () => Promise<void>;
  runPythonCode: () => Promise<void>;
  stopProgram: () => void;
  appendOutput: (text: string) => void;
  clearOutput: () => void;
}

const DEFAULT_PYTHON = `# Welcome — write your pib program here.
# Simulator (no robot) understands these patterns:
#   pib.apply_pose("name")   – move to a saved pose
#   pib.set_motor("name", deg) – set a single motor (degrees)
#   time.sleep(seconds)      – pause
#   print("text")            – log to console
#   for i in range(N):       – repeat N times
# Other Python lines run only on a real robot.

import time

print("Hello from pib!")
time.sleep(0.5)
`;

export const useProgramStore = create<ProgramState>((set, get) => ({
  blocklyJson: null,
  generatedPython: "",
  pythonCode: DEFAULT_PYTHON,
  isRunning: false,
  runOutput: "",
  backendProgramId: null,

  setBlocklyJson: (json) => set({ blocklyJson: json }),
  setGeneratedPython: (code) => set({ generatedPython: code }),
  setPythonCode: (code) => set({ pythonCode: code }),

  appendOutput: (text) =>
    set((state) => ({ runOutput: state.runOutput + text + "\n" })),

  clearOutput: () => set({ runOutput: "" }),

  runProgram: async () => {
    const { blocklyJson, generatedPython } = get();
    if (!generatedPython.trim() && !blocklyJson) {
      set({ runOutput: "No program to run. Create blocks in No-Code first.\n", isRunning: false });
      return;
    }

    const executionTarget = useExecutionTargetStore.getState().target;
    const isRealRobot = executionTarget === "robot";
    const backendStatus = useBackendConnectionStore.getState().status;

    // If running on real robot, check backend connection
    if (isRealRobot && backendStatus !== "connected") {
      set({
        runOutput: "Cannot run on robot: Not connected to robot backend.\nPlease check your connection or switch to Simulator.\n",
        isRunning: false
      });
      return;
    }

    set({
      isRunning: true,
      runOutput: `Running Blockly program on ${isRealRobot ? "ROBOT" : "SIMULATOR"}...\n`
    });

    if (isRealRobot) {
      // Backend execution for Blockly on real robot
      try {
        // Use generated Python code
        const pythonCode = generatedPython.trim();
        if (!pythonCode) {
          set({
            runOutput: "No valid Python code generated from Blockly blocks.\n",
            isRunning: false
          });
          return;
        }

        const result = await programApi.createProgram({
          name: `blockly_${Date.now()}`,
          code: pythonCode,
        });

        if (result.success && result.data) {
          const programId = result.data.id;
          const runResult = await programApi.runProgram(programId);
          if (runResult.success) {
            set((s) => ({
              runOutput: s.runOutput + "Blockly program executed successfully on robot.\n",
              isRunning: false,
              backendProgramId: programId,
            }));
          } else {
            set((s) => ({
              runOutput: s.runOutput + `Error: ${runResult.error}\n`,
              isRunning: false
            }));
          }
        } else {
          set((s) => ({
            runOutput: s.runOutput + `Error creating program: ${result.error}\n`,
            isRunning: false
          }));
        }
      } catch (error) {
        set((s) => ({
          runOutput: s.runOutput + `Error: ${error instanceof Error ? error.message : "Unknown error"}\n`,
          isRunning: false
        }));
      }
    } else {
      // Simulator execution
      try {
        const simulator = useSimulatorStore.getState();
        await simulator.executeProgram(blocklyJson, executionTarget);

        const simOutput = useSimulatorStore.getState().output;
        const outputText = simOutput.join("\n");
        set({ runOutput: outputText + "\n", isRunning: false });
      } catch (error) {
        set({
          runOutput: `Error: ${error instanceof Error ? error.message : "Unknown error"}\n`,
          isRunning: false
        });
      }
    }
  },

  runPythonCode: async () => {
    const { pythonCode } = get();
    if (!pythonCode.trim()) return;

    const executionTarget = useExecutionTargetStore.getState().target;
    const isRealRobot = executionTarget === "robot";
    const backendStatus = useBackendConnectionStore.getState().status;

    // If running on real robot, check backend connection
    if (isRealRobot && backendStatus !== "connected") {
      set({
        runOutput: "Cannot run on robot: Not connected to robot backend.\nPlease check your connection or switch to Simulator.\n",
        isRunning: false
      });
      return;
    }

    set({
      isRunning: true,
      runOutput: `Running Python program on ${isRealRobot ? "ROBOT" : "SIMULATOR"}...\n`
    });

    if (isRealRobot) {
      // Backend execution for Python on real robot
      try {
        const result = await programApi.createProgram({
          name: `python_${Date.now()}`,
          code: pythonCode,
        });

        if (result.success && result.data) {
          const programId = result.data!.id;
          const runResult = await programApi.runProgram(programId);
          if (runResult.success) {
            set((s) => ({
              runOutput: s.runOutput + "Program executed successfully.\n",
              backendProgramId: programId,
            }));
          } else {
            set((s) => ({
              runOutput: s.runOutput + `Error: ${runResult.error}\n`,
            }));
          }
        } else {
          set((s) => ({
            runOutput: s.runOutput + `Error creating program: ${result.error}\n`,
          }));
        }
      } catch (err) {
        set((s) => ({
          runOutput:
            s.runOutput +
            `Error: ${err instanceof Error ? err.message : "Unknown error"}\n`,
        }));
      } finally {
        set({ isRunning: false });
      }
    } else {
      // Simulator execution - interpret Python locally
      try {
        const simulator = useSimulatorStore.getState();
        await simulator.executePython(pythonCode, executionTarget);

        const simOutput = useSimulatorStore.getState().output;
        const outputText = simOutput.join("\n");
        set({ runOutput: outputText + "\n", isRunning: false });
      } catch (error) {
        set({
          runOutput: `Error: ${error instanceof Error ? error.message : "Unknown error"}\n`,
          isRunning: false,
        });
      }
    }
  },

  stopProgram: () => {
    useSimulatorStore.getState().stopExecution();
    set({ isRunning: false });
  },
}));
