import { useEffect, useRef } from "react";
import { useAIStore } from "../../stores/aiStore";
import ChatMessageComponent from "./ChatMessage";
import SpeechIndicator from "./SpeechIndicator";
import VisionPreview from "./VisionPreview";

export default function ChatPanel() {
  const { messages, activeChatId, isThinking, isListening, isSpeaking } =
    useAIStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  if (!activeChatId) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Select or create a chat to begin
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Vision preview overlay */}
      <div className="absolute top-3 right-3 z-10">
        <VisionPreview />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-white/30 text-sm py-8">
              Start a conversation...
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessageComponent key={msg.messageId} message={msg} />
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-xl bg-white/[0.08] text-white/40 text-sm rounded-bl-sm">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Speech indicator */}
      <div className="flex justify-center pb-2">
        <SpeechIndicator isListening={isListening} isSpeaking={isSpeaking} />
      </div>
    </div>
  );
}
