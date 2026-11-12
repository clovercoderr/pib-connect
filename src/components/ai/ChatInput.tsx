import { useState, useEffect, useRef } from "react";
import { useAIStore } from "../../stores/aiStore";
import { useCameraStore } from "../../stores/cameraStore";
import MicrophoneButton from "../audio/MicrophoneButton";

export default function ChatInput() {
  const {
    activeChatId,
    isThinking,
    isListening,
    visionEnabled,
    robotControlEnabled,
    sttText,
    sendMessage,
    toggleListening,
    toggleVision,
    toggleRobotControl,
    clearSttText,
  } = useAIStore();
  const { frameData } = useCameraStore();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fill input from STT
  useEffect(() => {
    if (sttText) {
      setText((prev) => (prev ? prev + " " + sttText : sttText));
      clearSttText();
    }
  }, [sttText, clearSttText]);

  const handleSend = () => {
    const content = text.trim();
    if (!content || !activeChatId || isThinking) return;

    const imageBase64 = visionEnabled && frameData ? frameData : undefined;
    sendMessage(content, imageBase64);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/[0.06] p-3">
      <div className="flex items-end gap-2">
        <div className="flex gap-1 shrink-0">
          <MicrophoneButton isListening={isListening} onToggle={toggleListening} />
          <button
            onClick={toggleVision}
            className={`p-2 rounded-lg transition-colors ${
              visionEnabled
                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70"
            }`}
            title={visionEnabled ? "Disable vision" : "Enable vision"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={toggleRobotControl}
            className={`p-2 rounded-lg transition-colors ${
              robotControlEnabled
                ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70"
            }`}
            title={robotControlEnabled ? "AI robot control ON" : "Enable AI robot control"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </button>
        </div>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            activeChatId
              ? robotControlEnabled
                ? "Ask the AI to move the robot..."
                : "Type a message..."
              : "Select or create a chat first"
          }
          disabled={!activeChatId || isThinking}
          rows={1}
          className="flex-1 resize-none px-3 py-2 text-sm rounded-xl bg-white/[0.06] border border-white/[0.06] text-white/90 placeholder-white/30 outline-none focus:border-blue-500/50 disabled:opacity-40 max-h-32"
          style={{ minHeight: "36px" }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || !activeChatId || isThinking}
          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 shrink-0"
          title="Send message"
        >
          {isThinking ? (
            <span className="w-4 h-4 block border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          )}
        </button>
      </div>

      {robotControlEnabled && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400/60">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          AI can control the robot. Try "wave at me" or "look left".
        </div>
      )}
    </div>
  );
}
