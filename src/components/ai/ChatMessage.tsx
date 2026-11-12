import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "../../lib/pibApi";
import { cleanAIResponseText, executeAIRobotCommands } from "../../stores/aiStore";

export default function ChatMessage({ message }: { message: ChatMessageType }) {
  // Display text is derived fresh on every render. AI messages stream in
  // as growing cumulative updates (same messageId, longer content each
  // time) — deriving the display text here, instead of freezing it in a
  // ref, is what lets those updates actually show without a reload.
  // Stripping robot-command markup is pure, so recomputing is cheap+safe.
  const content = useMemo(
    () =>
      message.isUser
        ? message.content
        : cleanAIResponseText(message.content),
    [message.isUser, message.content],
  );

  // Executing robot commands IS a side effect, so it must run at most once
  // per message — and only on the *final* text, not every streamed chunk.
  // The cleanup resets the timer on each content update, so the commands
  // fire 800ms after streaming stops (content goes stable).
  const executedRef = useRef(false);
  useEffect(() => {
    if (message.isUser || executedRef.current) return;
    const timer = setTimeout(() => {
      executedRef.current = true;
      executeAIRobotCommands(message.content);
    }, 800);
    return () => clearTimeout(timer);
  }, [message.isUser, message.content]);

  return (
    <div className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
          message.isUser
            ? "bg-blue-600/80 text-white rounded-br-sm"
            : "bg-white/[0.08] text-white/90 rounded-bl-sm"
        }`}
      >
        {message.isUser ? (
          // User messages are plain text — render verbatim.
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          // AI messages render as Markdown so lists, bold, code, etc.
          // look right. `markdown-body` scopes the element styling below.
          <div className="markdown-body break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
        <span className="block text-[10px] mt-1 opacity-40">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
