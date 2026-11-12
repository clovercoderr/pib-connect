import { useEffect, useRef, useCallback } from "react";
import * as Blockly from "blockly";
import "blockly/python";
import { pythonGenerator } from "blockly/python";
import { registerPibBlocks } from "../../lib/blockly/blocks";
import { registerPibGenerators } from "../../lib/blockly/generators";
import { PIB_TOOLBOX } from "./BlocklyToolbox";
import { useProgramStore } from "../../stores/programStore";

// Register custom blocks and generators once
let blocksRegistered = false;
function ensureBlocksRegistered() {
  if (!blocksRegistered) {
    registerPibBlocks();
    registerPibGenerators();
    blocksRegistered = true;
  }
}

// Dark theme for Blockly
const PIB_THEME = Blockly.Theme.defineTheme("pib_dark", {
  name: "pib_dark",
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: "#111118",
    toolboxBackgroundColour: "#1a1a24",
    toolboxForegroundColour: "#ffffff99",
    flyoutBackgroundColour: "#1a1a24",
    flyoutForegroundColour: "#ffffff99",
    flyoutOpacity: 0.9,
    scrollbarColour: "#ffffff15",
    scrollbarOpacity: 0.5,
    insertionMarkerColour: "#ffffff",
    insertionMarkerOpacity: 0.3,
  },
  fontStyle: {
    family: "Inter, system-ui, sans-serif",
    weight: "500",
    size: 11,
  },
});

export function BlocklyEditor({ onCodeChange }: { onCodeChange?: (python: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  const {
    blocklyJson,
    setBlocklyJson,
    setGeneratedPython,
  } = useProgramStore();

  const generateCode = useCallback(() => {
    if (!workspaceRef.current) return;
    const code = pythonGenerator.workspaceToCode(workspaceRef.current);
    const fullCode = `import time\nfrom pib_sdk.kinematics import fk, ik\n\n${code}`;
    setGeneratedPython(fullCode);
    onCodeChange?.(fullCode);
  }, [setGeneratedPython, onCodeChange]);

  // Initialize Blockly workspace
  useEffect(() => {
    if (!containerRef.current) return;
    ensureBlocksRegistered();

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: PIB_TOOLBOX,
      theme: PIB_THEME,
      grid: {
        spacing: 25,
        length: 3,
        colour: "#ffffff08",
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 2,
        minScale: 0.5,
        scaleSpeed: 1.1,
      },
      trashcan: true,
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
      renderer: "zelos",
    });

    workspaceRef.current = workspace;

    // Load saved workspace state
    if (blocklyJson) {
      try {
        Blockly.serialization.workspaces.load(
          blocklyJson as Blockly.serialization.blocks.State,
          workspace
        );
      } catch {
        // Ignore load errors for incompatible states
      }
    }

    // Listen for workspace changes
    workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      // Save workspace state
      const state = Blockly.serialization.workspaces.save(workspace);
      setBlocklyJson(state);
      // Generate Python code
      generateCode();
    });

    // Initial code generation
    generateCode();

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !workspaceRef.current) return;

    const observer = new ResizeObserver(() => {
      Blockly.svgResize(workspaceRef.current!);
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#111118]">
      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Blockly workspace */}
        <div
          ref={containerRef}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
