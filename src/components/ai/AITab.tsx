import ChatSidebar from "./ChatSidebar";
import ChatPanel from "./ChatPanel";
import ChatInput from "./ChatInput";
import PersonalityEditor from "./PersonalityEditor";
import { useAIStore } from "../../stores/aiStore";

export default function AITab() {
  const { error, clearError, editingPersonalityId } = useAIStore();

  return (
    <div className="flex h-full bg-[var(--color-surface-base)]">
      <ChatSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="hover:text-red-300">
              Dismiss
            </button>
          </div>
        )}

        {/* The main area is either the personality editor (when one is being
            edited) or the chat. Editing a personality "opens where the chat
            is" — the sidebar stays put so you keep your bearings. */}
        {editingPersonalityId ? (
          // key forces a remount when switching which personality is being
          // edited, so the editor's form state re-initializes from the
          // right personality instead of showing stale values.
          <PersonalityEditor key={editingPersonalityId} />
        ) : (
          <>
            <ChatPanel />
            <ChatInput />
          </>
        )}
      </div>
    </div>
  );
}
