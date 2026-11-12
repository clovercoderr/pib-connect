/**
 * AI Robot Control - Parses motor commands from AI responses and applies them.
 *
 * The AI can steer the robot by including special commands in its response:
 *
 * Commands:
 *   [MOVE:joint_name=degrees]              - Move a single joint (e.g. -45 to 45)
 *   [POSE:pose_name]                       - Apply a saved pose by name
 *   [WAVE]                                 - Perform a wave gesture
 *   [NOD]                                  - Nod head
 *   [SHAKE]                                - Shake head
 *   [RESET]                                - Reset to home pose
 *
 * Values are in degrees (-90 to 90 by default). Internally stored as centidegrees.
 */

import { useRobotStore, jointToMotorMap } from "../stores/robotStore";
import { usePoseStore } from "../stores/poseStore";
import { JOINT_CONFIGS } from "./jointConfig";

// Joint name aliases for natural language
const JOINT_ALIASES: Record<string, string> = {
  head_left_right: "neck_pan",
  head_up_down: "neck_tilt",
  head_pan: "neck_pan",
  head_tilt: "neck_tilt",
  neck_left_right: "neck_pan",
  neck_up_down: "neck_tilt",
  right_shoulder: "right_shoulder_inner",
  left_shoulder: "left_shoulder_inner",
  right_elbow: "right_elbow",
  left_elbow: "left_elbow",
  right_wrist: "right_wrist",
  left_wrist: "left_wrist",
};

function resolveJointId(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[\s-]+/g, "_");
  if (JOINT_CONFIGS.some((j) => j.id === normalized)) return normalized;
  if (JOINT_ALIASES[normalized]) return JOINT_ALIASES[normalized];
  for (const [jointId, motorName] of Object.entries(jointToMotorMap)) {
    if (motorName === normalized) return jointId;
  }
  return null;
}

export interface RobotCommand {
  type: "move" | "pose" | "gesture" | "reset";
  params?: Record<string, unknown>;
}

/** Parse robot commands from AI response text. Returns clean text + commands. */
export function parseRobotCommands(text: string): {
  cleanText: string;
  commands: RobotCommand[];
} {
  const commands: RobotCommand[] = [];
  let cleanText = text;

  // Parse [MOVE:joint=degrees] commands (degrees, e.g. -45, 30, 90)
  const moveRegex = /\[MOVE:(\w+)=(-?\d+(?:\.\d+)?)\]/g;
  let match;
  while ((match = moveRegex.exec(text)) !== null) {
    const jointId = resolveJointId(match[1]);
    const degrees = parseFloat(match[2]);
    if (jointId && degrees >= -180 && degrees <= 180) {
      commands.push({
        type: "move",
        params: { jointId, centidegrees: Math.round(degrees * 100) },
      });
    }
  }
  cleanText = cleanText.replace(moveRegex, "").trim();

  // Parse [POSE:name] commands
  const poseRegex = /\[POSE:([^\]]+)\]/g;
  while ((match = poseRegex.exec(text)) !== null) {
    commands.push({
      type: "pose",
      params: { name: match[1].trim() },
    });
  }
  cleanText = cleanText.replace(poseRegex, "").trim();

  // Parse gesture commands
  const gestures = ["WAVE", "NOD", "SHAKE"] as const;
  for (const gesture of gestures) {
    const gestureRegex = new RegExp(`\\[${gesture}\\]`, "g");
    if (gestureRegex.test(text)) {
      commands.push({ type: "gesture", params: { gesture: gesture.toLowerCase() } });
    }
    cleanText = cleanText.replace(gestureRegex, "").trim();
  }

  // Parse [RESET]
  if (/\[RESET\]/g.test(text)) {
    commands.push({ type: "reset" });
  }
  cleanText = cleanText.replace(/\[RESET\]/g, "").trim();

  return { cleanText, commands };
}

/** Execute parsed robot commands. */
export async function executeRobotCommands(commands: RobotCommand[]): Promise<void> {
  const { setJointPosition, setAllPositions, resetPositions } = useRobotStore.getState();

  for (const cmd of commands) {
    switch (cmd.type) {
      case "move": {
        const { jointId, centidegrees } = cmd.params as { jointId: string; centidegrees: number };
        setJointPosition(jointId, centidegrees);
        break;
      }
      case "pose": {
        const { name } = cmd.params as { name: string };
        const poses = usePoseStore.getState().poses;
        const pose = poses.find(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );
        if (pose) {
          setAllPositions(pose.motorPositions);
        }
        break;
      }
      case "gesture": {
        const { gesture } = cmd.params as { gesture: string };
        await executeGesture(gesture);
        break;
      }
      case "reset":
        resetPositions();
        break;
    }
    // Small delay between commands
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function executeGesture(gesture: string): Promise<void> {
  const { setJointPosition } = useRobotStore.getState();
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  switch (gesture) {
    case "wave": {
      // Raise right arm and wave (values in centidegrees)
      setJointPosition("right_shoulder_inner", 4500);  // 45 degrees
      setJointPosition("right_elbow", 3000);           // 30 degrees
      await delay(500);
      for (let i = 0; i < 3; i++) {
        setJointPosition("right_wrist", 4500);   // 45 degrees
        await delay(300);
        setJointPosition("right_wrist", -4500);  // -45 degrees
        await delay(300);
      }
      setJointPosition("right_wrist", 0);
      await delay(300);
      setJointPosition("right_shoulder_inner", 0);
      setJointPosition("right_elbow", 0);
      break;
    }
    case "nod": {
      const center = useRobotStore.getState().jointPositions.neck_tilt ?? 0;
      for (let i = 0; i < 2; i++) {
        setJointPosition("neck_tilt", center + 1500);  // +15 degrees
        await delay(300);
        setJointPosition("neck_tilt", center - 1000);  // -10 degrees
        await delay(300);
      }
      setJointPosition("neck_tilt", center);
      break;
    }
    case "shake": {
      const center = useRobotStore.getState().jointPositions.neck_pan ?? 0;
      for (let i = 0; i < 2; i++) {
        setJointPosition("neck_pan", center + 2000);  // +20 degrees
        await delay(250);
        setJointPosition("neck_pan", center - 2000);  // -20 degrees
        await delay(250);
      }
      setJointPosition("neck_pan", center);
      break;
    }
  }
}

/** Get the system prompt that instructs the AI about robot control. */
export function getRobotControlSystemPrompt(): string {
  const poseNames = usePoseStore.getState().poses.map((p) => p.name);

  const jointList = JOINT_CONFIGS.filter(
    (j) => ["neck", "right_arm", "left_arm"].includes(j.group)
  ).map((j) => `  ${j.id} (${j.label})`).join("\n");

  return `You are an AI assistant controlling a physical humanoid robot called pib.
You can control the robot by including special commands in your response.

Available commands:
- [MOVE:joint_name=degrees] - Move a joint to a position in degrees (-90 to 90, 0=center)
- [POSE:name] - Apply a saved pose
- [WAVE] - Wave gesture
- [NOD] - Nod head (yes)
- [SHAKE] - Shake head (no)
- [RESET] - Reset to home position

Available joints:
${jointList}

${poseNames.length > 0 ? `Saved poses: ${poseNames.join(", ")}` : "No saved poses yet."}

You can include multiple commands. Commands are embedded in your text response.
Example: "Sure, let me wave at you! [WAVE] How's that?"
Example: "Let me look to the right. [MOVE:neck_pan=-30]"

Only use commands when the user asks you to move or when it's natural to gesture.
Always respond conversationally in addition to any commands.`;
}
