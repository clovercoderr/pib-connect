export const PIB_TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Movement",
      colour: "#4a9eff",
      contents: [
        { kind: "block", type: "pib_move_to_pose" },
        { kind: "block", type: "pib_set_motor" },
      ],
    },
    {
      kind: "category",
      name: "Timing",
      colour: "#f59e0b",
      contents: [
        { kind: "block", type: "pib_wait" },
        { kind: "block", type: "pib_repeat" },
      ],
    },
    {
      kind: "category",
      name: "Logic",
      colour: "#ec4899",
      contents: [
        { kind: "block", type: "controls_if" },
        { kind: "block", type: "logic_compare" },
        { kind: "block", type: "logic_operation" },
        { kind: "block", type: "logic_negate" },
        { kind: "block", type: "logic_boolean" },
      ],
    },
    {
      kind: "category",
      name: "Math",
      colour: "#6366f1",
      contents: [
        { kind: "block", type: "math_number" },
        { kind: "block", type: "math_arithmetic" },
        { kind: "block", type: "math_random_int" },
      ],
    },
    {
      kind: "category",
      name: "Text",
      colour: "#8b5cf6",
      contents: [
        { kind: "block", type: "text" },
        { kind: "block", type: "text_join" },
        { kind: "block", type: "pib_print" },
      ],
    },
    {
      kind: "category",
      name: "Variables",
      colour: "#f97316",
      custom: "VARIABLE",
    },
  ],
};
