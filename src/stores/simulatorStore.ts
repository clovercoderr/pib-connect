import { create } from "zustand";
import { useRobotStore } from "./robotStore";
import { usePoseStore } from "./poseStore";
import { useExecutionTargetStore, type ExecutionTarget } from "./executionTargetStore";
import { motorApi } from "../lib/pibApi";
import { jointToMotorName, motorToJointIds } from "../lib/jointConfig";

interface SimulatorState {
  isRunning: boolean;
  output: string[];
  startingPositions: Record<string, number> | null;
  executeProgram: (blocklyJson: object | null, target?: ExecutionTarget) => Promise<void>;
  executePython: (pythonCode: string, target?: ExecutionTarget) => Promise<void>;
  stopExecution: () => void;
}

let executionAborted = false;

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  isRunning: false,
  output: [],
  startingPositions: null,

  executeProgram: async (blocklyJson: object | null, target?: ExecutionTarget) => {
    if (!blocklyJson) {
      set({ output: ["No program to execute"] });
      return;
    }

    const executionTarget = target || useExecutionTargetStore.getState().target;
    const isRealRobot = executionTarget === "robot";

    // Save starting positions for restore on stop
    const startingPositions = { ...useRobotStore.getState().jointPositions };

    executionAborted = false;
    set({
      isRunning: true,
      startingPositions,
      output: [`Starting program on ${isRealRobot ? "ROBOT" : "SIMULATOR"}...`]
    });

    const addOutput = (text: string) => {
      set((state) => ({ output: [...state.output, text] }));
    };

    const poses = usePoseStore.getState().poses;

    try {
      let blocks: any[] = [];

      if ((blocklyJson as any).blocks?.blocks) {
        blocks = (blocklyJson as any).blocks.blocks;
      } else if (Array.isArray((blocklyJson as any).blocks)) {
        blocks = (blocklyJson as any).blocks;
      } else if (Array.isArray(blocklyJson)) {
        blocks = blocklyJson;
      } else {
        const findBlocks = (obj: any): any[] => {
          if (!obj || typeof obj !== 'object') return [];
          if (Array.isArray(obj)) {
            return obj.filter(item => item && typeof item === 'object' && item.type);
          }
          if (obj.type && typeof obj.type === 'string') {
            return [obj];
          }
          let found: any[] = [];
          for (const key of Object.keys(obj)) {
            found = found.concat(findBlocks(obj[key]));
          }
          return found;
        };
        blocks = findBlocks(blocklyJson);
      }

      if (blocks.length === 0) {
        addOutput("No blocks found to execute");
        set({ isRunning: false });
        return;
      }

      addOutput(`Found ${blocks.length} top-level block(s)`);

      for (const block of blocks) {
        if (executionAborted) break;
        await executeBlockChain(block, poses, addOutput, isRealRobot);
      }

      if (!executionAborted) {
        addOutput("Program completed");
      } else {
        addOutput("Program stopped");
      }
    } catch (error) {
      addOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      set({ isRunning: false });
    }
  },

  executePython: async (pythonCode: string, target?: ExecutionTarget) => {
    if (!pythonCode.trim()) {
      set({ output: ["No code to execute"] });
      return;
    }

    const executionTarget = target || useExecutionTargetStore.getState().target;
    const isRealRobot = executionTarget === "robot";

    // Save starting positions for restore on stop
    const startingPositions = { ...useRobotStore.getState().jointPositions };

    executionAborted = false;
    set({
      isRunning: true,
      startingPositions,
      output: [`Running Python on ${isRealRobot ? "ROBOT" : "SIMULATOR"}...`],
    });

    const addOutput = (text: string) => {
      set((state) => ({ output: [...state.output, text] }));
    };

    const poses = usePoseStore.getState().poses;

    try {
      await executePythonCode(pythonCode, poses, addOutput, isRealRobot);

      if (!executionAborted) {
        addOutput("Program completed");
      } else {
        addOutput("Program stopped");
      }
    } catch (error) {
      addOutput(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      set({ isRunning: false });
    }
  },

  stopExecution: () => {
    executionAborted = true;

    // Restore starting positions
    const { startingPositions } = get();
    if (startingPositions) {
      useRobotStore.getState().setAllPositionsLocal(startingPositions);
    }

    set({ isRunning: false, startingPositions: null });
  },
}));

// ── Blockly Block Execution ──────────────────────────────────────────

async function executeBlockChain(
  block: any,
  poses: any[],
  addOutput: (text: string) => void,
  isRealRobot: boolean
) {
  let current = block;

  while (current && !executionAborted) {
    await executeSingleBlock(current, poses, addOutput, isRealRobot);

    let nextBlock = null;
    if (current.next) {
      if (typeof current.next === 'object') {
        nextBlock = current.next.block || current.next;
      }
    }
    current = nextBlock;
  }
}

async function executeSingleBlock(
  block: any,
  poses: any[],
  addOutput: (text: string) => void,
  isRealRobot: boolean
) {
  const blockType = block.type;
  const fields = block.fields || {};
  const inputs = block.inputs || {};

  switch (blockType) {
    case "pib_move_to_pose": {
      const poseName = fields.POSE_NAME?.trim() || "default";
      addOutput(`Moving to pose: ${poseName}`);

      const pose = poses.find((p) => p.name === poseName);
      if (pose) {
        await applyPose(pose.motorPositions, isRealRobot, addOutput);
        addOutput(`  Applied pose: ${poseName}`);
      } else {
        addOutput(`  Pose "${poseName}" not found`);
      }
      break;
    }

    case "pib_set_motor": {
      const motorName = fields.MOTOR_NAME?.trim() || "neck_pan";
      const degrees = parseInt(fields.POSITION, 10) || 0;
      const centidegrees = degrees * 100;
      addOutput(`Setting motor ${motorName} to ${degrees} deg`);
      await applyMotor(motorName, centidegrees, isRealRobot, addOutput);
      break;
    }

    case "pib_wait": {
      const seconds = parseFloat(fields.SECONDS) || 1;
      addOutput(`Waiting ${seconds}s...`);
      await abortableWait(seconds * 1000);
      break;
    }

    case "pib_print": {
      const text = fields.TEXT || "";
      addOutput(`> ${text}`);
      break;
    }

    case "pib_repeat": {
      const times = parseInt(fields.TIMES, 10) || 3;
      addOutput(`Repeating ${times} times`);

      const innerBlock = inputs.DO?.block || inputs.DO || null;

      if (innerBlock) {
        for (let i = 0; i < times && !executionAborted; i++) {
          addOutput(`  Iteration ${i + 1}/${times}`);
          await executeBlockChain(innerBlock, poses, addOutput, isRealRobot);
        }
      } else {
        addOutput(`  (No inner blocks to repeat)`);
      }
      break;
    }

    default: {
      // Skip unknown blocks silently (standard Blockly blocks like variables, math, etc.)
      break;
    }
  }
}

// ── Python Execution ─────────────────────────────────────────────────

async function executePythonCode(
  code: string,
  poses: any[],
  addOutput: (text: string) => void,
  isRealRobot: boolean
) {
  const lines = code.split("\n");

  // Parse into executable statements (handling indentation for loops)
  const statements = parsePythonStatements(lines);
  await executeStatements(statements, poses, addOutput, isRealRobot);
}

interface PythonStatement {
  type: "apply_pose" | "set_motor" | "sleep" | "print" | "for_range" | "skip";
  args: any;
  body?: PythonStatement[];
}

function parsePythonStatements(lines: string[]): PythonStatement[] {
  const statements: PythonStatement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // Skip empty lines, comments, imports
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      i++;
      continue;
    }

    // pib.apply_pose("name") | pib.move_to_pose("name") | pib.pose("name")
    const poseMatch = trimmed.match(/^pib\.(?:apply_pose|move_to_pose|pose)\(\s*["']([^"']+)["']\s*\)/);
    if (poseMatch) {
      statements.push({ type: "apply_pose", args: { name: poseMatch[1] } });
      i++;
      continue;
    }

    // pib.set_motor("name", degrees) | pib.set_position("name", degrees)
    const motorMatch = trimmed.match(/^pib\.(?:set_motor|set_position)\(\s*["']([^"']+)["']\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (motorMatch) {
      const degrees = parseFloat(motorMatch[2]);
      statements.push({ type: "set_motor", args: { name: motorMatch[1], position: Math.round(degrees * 100) } });
      i++;
      continue;
    }

    // time.sleep(seconds)
    const sleepMatch = trimmed.match(/^time\.sleep\(\s*([\d.]+)\s*\)/);
    if (sleepMatch) {
      statements.push({ type: "sleep", args: { seconds: parseFloat(sleepMatch[1]) } });
      i++;
      continue;
    }

    // print(...)
    const printMatch = trimmed.match(/^print\(\s*(.*)\s*\)$/);
    if (printMatch) {
      let text = printMatch[1];
      // Strip quotes if it's a simple string
      const strMatch = text.match(/^["'](.*)["']$/);
      if (strMatch) text = strMatch[1];
      // Handle f-strings simply
      const fstrMatch = text.match(/^f["'](.*)["']$/);
      if (fstrMatch) text = fstrMatch[1];
      statements.push({ type: "print", args: { text } });
      i++;
      continue;
    }

    // for _var in range(N):
    const forMatch = trimmed.match(/^for\s+\w+\s+in\s+range\(\s*(\d+)\s*\)\s*:/);
    if (forMatch) {
      const times = parseInt(forMatch[1], 10);
      // Collect indented body
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length) {
        const bodyLine = lines[i];
        const bodyTrimmed = bodyLine.trim();
        if (!bodyTrimmed) { i++; continue; } // skip empty lines in body
        const bodyIndent = bodyLine.length - bodyLine.trimStart().length;
        if (bodyIndent <= indent) break; // back to outer level
        bodyLines.push(bodyTrimmed);
        i++;
      }
      const body = parsePythonStatements(bodyLines);
      statements.push({ type: "for_range", args: { times }, body });
      continue;
    }

    // Unknown line - skip
    statements.push({ type: "skip", args: { line: trimmed } });
    i++;
  }

  return statements;
}

async function executeStatements(
  statements: PythonStatement[],
  poses: any[],
  addOutput: (text: string) => void,
  isRealRobot: boolean
) {
  for (const stmt of statements) {
    if (executionAborted) break;

    switch (stmt.type) {
      case "apply_pose": {
        const poseName = stmt.args.name;
        addOutput(`Moving to pose: ${poseName}`);
        const pose = poses.find((p) => p.name === poseName);
        if (pose) {
          await applyPose(pose.motorPositions, isRealRobot, addOutput);
          addOutput(`  Applied pose: ${poseName}`);
        } else {
          addOutput(`  Pose "${poseName}" not found`);
        }
        break;
      }

      case "set_motor": {
        const { name, position } = stmt.args;
        addOutput(`Setting motor ${name} to ${position}`);
        await applyMotor(name, position, isRealRobot, addOutput);
        break;
      }

      case "sleep": {
        const seconds = stmt.args.seconds;
        addOutput(`Waiting ${seconds}s...`);
        await abortableWait(seconds * 1000);
        break;
      }

      case "print": {
        addOutput(`> ${stmt.args.text}`);
        break;
      }

      case "for_range": {
        const times = stmt.args.times;
        addOutput(`Repeating ${times} times`);
        if (stmt.body) {
          for (let i = 0; i < times && !executionAborted; i++) {
            addOutput(`  Iteration ${i + 1}/${times}`);
            await executeStatements(stmt.body, poses, addOutput, isRealRobot);
          }
        }
        break;
      }

      case "skip": {
        // Surface unrecognized lines so users understand what the simulator
        // can and can't run, instead of failing silently.
        const line = stmt.args?.line;
        if (line) addOutput(`(skipped, not supported in simulator) ${line}`);
        break;
      }
    }
  }
}

// ── Shared Helpers ───────────────────────────────────────────────────

async function applyPose(
  motorPositions: Record<string, number>,
  isRealRobot: boolean,
  addOutput: (text: string) => void
) {
  if (isRealRobot) {
    try {
      const seen = new Set<string>();
      const motorPromises = Object.entries(motorPositions).flatMap(([key, position]) => {
        const motorName = jointToMotorName[key] ?? key;
        if (seen.has(motorName)) return [];
        seen.add(motorName);
        return [motorApi.setMotorPosition(motorName, position as number)];
      });
      await Promise.all(motorPromises);
    } catch (error) {
      addOutput(`  Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  } else {
    // Simulator: update local state only (no API calls)
    useRobotStore.getState().setAllPositionsLocal(motorPositions);
  }
}

async function applyMotor(
  motorName: string,
  position: number,
  isRealRobot: boolean,
  addOutput: (text: string) => void
) {
  const backendMotorName = jointToMotorName[motorName] ?? motorName;

  if (isRealRobot) {
    try {
      await motorApi.setMotorPosition(backendMotorName, position);
    } catch (error) {
      addOutput(`  Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  } else {
    // Simulator: update local state only (no API calls)
    const currentPositions = { ...useRobotStore.getState().jointPositions };
    if (jointToMotorName[motorName]) {
      currentPositions[motorName] = position;
    } else {
      const jointIds = motorToJointIds[motorName];
      if (jointIds && jointIds.length > 0) {
        jointIds.forEach((jointId) => {
          currentPositions[jointId] = position;
        });
      } else {
        currentPositions[motorName] = position;
      }
    }
    useRobotStore.getState().setAllPositionsLocal(currentPositions);
  }
}

function abortableWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const interval = 100; // Check abort every 100ms
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (executionAborted || elapsed >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}
