import { pythonGenerator, Order } from "blockly/python";

export function registerPibGenerators() {
  // ── Move to Pose ──────────────────────────────────────────────
  pythonGenerator.forBlock["pib_move_to_pose"] = function (block) {
    const poseName = block.getFieldValue("POSE_NAME");
    return `pib.apply_pose("${poseName}")\n`;
  };

  // ── Set Motor Position ────────────────────────────────────────
  pythonGenerator.forBlock["pib_set_motor"] = function (block) {
    const motorName = block.getFieldValue("MOTOR_NAME");
    const position = block.getFieldValue("POSITION");
    return `pib.set_motor("${motorName}", ${position})\n`;
  };

  // ── Wait ──────────────────────────────────────────────────────
  pythonGenerator.forBlock["pib_wait"] = function (block) {
    const seconds = block.getFieldValue("SECONDS");
    return `time.sleep(${seconds})\n`;
  };

  // ── Repeat N Times ────────────────────────────────────────────
  pythonGenerator.forBlock["pib_repeat"] = function (block) {
    const times = block.getFieldValue("TIMES");
    const branch = pythonGenerator.statementToCode(block, "DO");
    const code = branch || pythonGenerator.INDENT + "pass\n";
    return `for _i in range(${times}):\n${code}`;
  };

  // ── Print / Log ───────────────────────────────────────────────
  pythonGenerator.forBlock["pib_print"] = function (block) {
    const text =
      pythonGenerator.valueToCode(block, "TEXT", Order.NONE) || '""';
    return `print(${text})\n`;
  };
}
