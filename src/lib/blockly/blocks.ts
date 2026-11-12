import * as Blockly from "blockly";
import { usePoseStore } from "../../stores/poseStore";
import { JOINT_CONFIGS } from "../jointConfig";

const COLORS = {
  movement: "#4a9eff",
  timing: "#f59e0b",
  motor: "#10b981",
  output: "#8b5cf6",
};

function getPoseOptions(): Array<[string, string]> {
  const poses = usePoseStore.getState().poses;
  if (poses.length === 0) {
    return [["default", "default"]];
  }
  return poses.map((p) => [p.name, p.name]);
}

function getMotorOptions(): Array<[string, string]> {
  return JOINT_CONFIGS.map((j) => [j.label || j.id, j.id]);
}

export function registerPibBlocks() {
  // ── Move to Pose ──────────────────────────────────────────────
  Blockly.Blocks["pib_move_to_pose"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("move to pose")
        .appendField(
          new Blockly.FieldDropdown(getPoseOptions),
          "POSE_NAME"
        );
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLORS.movement);
      this.setTooltip("Move the robot to a saved pose");
    },
  };

  // ── Set Motor Position ────────────────────────────────────────
  Blockly.Blocks["pib_set_motor"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("set motor")
        .appendField(
          new Blockly.FieldDropdown(getMotorOptions),
          "MOTOR_NAME"
        )
        .appendField("to")
        .appendField(new Blockly.FieldNumber(0, -90, 90, 1), "POSITION")
        .appendField("degrees");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLORS.motor);
      this.setTooltip("Set a motor to a specific position in degrees (-90 to 90)");
    },
  };

  // ── Wait ──────────────────────────────────────────────────────
  Blockly.Blocks["pib_wait"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("wait")
        .appendField(new Blockly.FieldNumber(1, 0.1, 60, 0.1), "SECONDS")
        .appendField("seconds");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLORS.timing);
      this.setTooltip("Wait for a number of seconds");
    },
  };

  // ── Repeat N Times ────────────────────────────────────────────
  Blockly.Blocks["pib_repeat"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField("repeat")
        .appendField(new Blockly.FieldNumber(3, 1, 100, 1), "TIMES")
        .appendField("times");
      this.appendStatementInput("DO").appendField("do");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLORS.timing);
      this.setTooltip("Repeat the enclosed blocks a number of times");
    },
  };

  // ── Print / Log ───────────────────────────────────────────────
  Blockly.Blocks["pib_print"] = {
    init(this: Blockly.Block) {
      this.appendValueInput("TEXT").appendField("print");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(COLORS.output);
      this.setTooltip("Print a message to the output");
    },
  };
}
