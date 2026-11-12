import { useRef, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useProgramStore } from "../../stores/programStore";

interface PythonEditorProps {
  code?: string;
  onChange?: (code: string) => void;
}

export function PythonEditor({ code, onChange }: PythonEditorProps) {
  const { pythonCode, setPythonCode } = useProgramStore();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const displayCode = code ?? pythonCode;

  const handleChange = (value: string | undefined) => {
    const newCode = value || "";
    setPythonCode(newCode);
    onChange?.(newCode);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.setTheme("pib-dark");

    // ── Keybindings ──────────────────────────────────────
    // Duplicate line (Cmd/Ctrl+Shift+D)
    editor.addAction({
      id: "duplicate-line",
      label: "Duplicate Line",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD,
      ],
      run: (ed) => {
        ed.getAction("editor.action.copyLinesDownAction")?.run();
      },
    });

    // Toggle comment (Cmd/Ctrl+/)
    editor.addAction({
      id: "toggle-comment",
      label: "Toggle Comment",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
      run: (ed) => {
        ed.getAction("editor.action.commentLine")?.run();
      },
    });

    // Move line up (Alt+Up)
    editor.addAction({
      id: "move-line-up",
      label: "Move Line Up",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
      run: (ed) => {
        ed.getAction("editor.action.moveLinesUpAction")?.run();
      },
    });

    // Move line down (Alt+Down)
    editor.addAction({
      id: "move-line-down",
      label: "Move Line Down",
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
      run: (ed) => {
        ed.getAction("editor.action.moveLinesDownAction")?.run();
      },
    });

    // Focus the editor so it's immediately interactive
    editor.focus();
  };

  const handleBeforeMount = useCallback((monaco: typeof Monaco) => {
    monaco.editor.defineTheme("pib-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6a6a8a", fontStyle: "italic" },
        { token: "keyword", foreground: "c792ea" },
        { token: "string", foreground: "c3e88d" },
        { token: "number", foreground: "f78c6c" },
        { token: "type", foreground: "ffcb6b" },
        { token: "function", foreground: "82aaff" },
        { token: "variable", foreground: "f07178" },
        { token: "operator", foreground: "89ddff" },
        { token: "delimiter", foreground: "89ddff" },
      ],
      colors: {
        "editor.background": "#111118",
        "editor.foreground": "#ffffffcc",
        "editor.lineHighlightBackground": "#ffffff08",
        "editor.lineHighlightBorder": "#ffffff06",
        "editorCursor.foreground": "#4a9eff",
        "editor.selectionBackground": "#4a9eff33",
        "editor.inactiveSelectionBackground": "#4a9eff18",
        "editor.selectionHighlightBackground": "#4a9eff15",
        "editor.wordHighlightBackground": "#4a9eff18",
        "editor.findMatchBackground": "#fbbf2440",
        "editor.findMatchHighlightBackground": "#fbbf2420",
        "editorLineNumber.foreground": "#ffffff20",
        "editorLineNumber.activeForeground": "#ffffff55",
        "editorIndentGuide.background": "#ffffff08",
        "editorIndentGuide.activeBackground": "#ffffff18",
        "editorBracketMatch.background": "#4a9eff20",
        "editorBracketMatch.border": "#4a9eff40",
        "editorWidget.background": "#1a1a24",
        "editorWidget.border": "#ffffff10",
        "editorSuggestWidget.background": "#1a1a24",
        "editorSuggestWidget.border": "#ffffff10",
        "editorSuggestWidget.selectedBackground": "#ffffff12",
        "editorSuggestWidget.highlightForeground": "#4a9eff",
        "editorHoverWidget.background": "#1a1a24",
        "editorHoverWidget.border": "#ffffff10",
        "input.background": "#ffffff08",
        "input.border": "#ffffff10",
        "input.foreground": "#ffffffcc",
        "focusBorder": "#4a9eff50",
        "scrollbarSlider.background": "#ffffff10",
        "scrollbarSlider.hoverBackground": "#ffffff20",
        "scrollbarSlider.activeBackground": "#ffffff30",
        "editorOverviewRuler.border": "#ffffff06",
        "editorGutter.background": "#111118",
        "minimap.background": "#111118",
      },
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* ── Editor toolbar ────────────────────────────────────── */}
      <EditorToolbar editorRef={editorRef} />

      {/* ── Monaco editor ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="python"
          theme="pib-dark"
          value={displayCode}
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          options={{
            // Font
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            lineHeight: 20,

            // Layout
            minimap: { enabled: false },
            lineNumbers: "on",
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,

            // Editing features
            tabSize: 4,
            insertSpaces: true,
            autoIndent: "full",
            formatOnPaste: true,
            formatOnType: true,
            autoClosingBrackets: "always",
            autoClosingQuotes: "always",
            autoSurround: "languageDefined",
            bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
            guides: { bracketPairs: true, indentation: true },

            // Find & replace
            find: {
              addExtraSpaceOnTop: false,
              autoFindInSelection: "multiline",
              seedSearchStringFromSelection: "selection",
            },

            // IntelliSense & suggestions
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            wordBasedSuggestions: "currentDocument",
            quickSuggestions: { other: true, comments: false, strings: false },
            parameterHints: { enabled: true },

            // Code folding
            folding: true,
            foldingStrategy: "indentation",
            showFoldingControls: "mouseover",

            // Selection & cursor
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            roundedSelection: true,
            renderLineHighlight: "line",
            multiCursorModifier: "ctrlCmd",
            columnSelection: false,
            dragAndDrop: true,

            // Render
            renderWhitespace: "selection",
            renderControlCharacters: false,
            linkedEditing: true,
            matchBrackets: "always",

            // Context menu (right-click)
            contextmenu: true,

            // Clipboard — ensure native copy/paste works
            copyWithSyntaxHighlighting: true,
          }}
        />
      </div>
    </div>
  );
}

/** Compact toolbar with common editor actions */
function EditorToolbar({
  editorRef,
}: {
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
}) {
  const run = (actionId: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    ed.getAction(actionId)?.run();
  };

  return (
    <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-border-subtle bg-surface-base">
      <ToolbarButton
        title="Undo (Cmd+Z)"
        onClick={() => editorRef.current?.trigger("toolbar", "undo", null)}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        title="Redo (Cmd+Shift+Z)"
        onClick={() => editorRef.current?.trigger("toolbar", "redo", null)}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-3.5 bg-white/[0.06] mx-1" />

      <ToolbarButton
        title="Find & Replace (Cmd+H)"
        onClick={() => run("editor.action.startFindReplaceAction")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        title="Command Palette (F1)"
        onClick={() => run("editor.action.quickCommand")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </ToolbarButton>

      <div className="w-px h-3.5 bg-white/[0.06] mx-1" />

      <ToolbarButton
        title="Toggle Comment (Cmd+/)"
        onClick={() => run("editor.action.commentLine")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m-15 0l4-4m-4 4l4 4" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        title="Format Document"
        onClick={() => run("editor.action.formatDocument")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
        </svg>
      </ToolbarButton>

      {/* Right side: keyboard hints */}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[10px] text-white/25 hidden md:block">
          Cmd+F find &middot; Cmd+H replace &middot; F1 commands
        </span>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
    >
      {children}
    </button>
  );
}
