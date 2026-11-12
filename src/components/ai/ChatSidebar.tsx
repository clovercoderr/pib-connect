import { useEffect, useState } from "react";
import { useAIStore } from "../../stores/aiStore";

export default function ChatSidebar() {
  const {
    chats,
    activeChatId,
    personalities,
    activePersonalityId,
    models,
    fetchChats,
    fetchPersonalities,
    fetchModels,
    createChat,
    deleteChat,
    renameChat,
    selectChat,
    setActivePersonality,
    createPersonality,
    setEditingPersonality,
  } = useAIStore();

  const [newChatTopic, setNewChatTopic] = useState("");
  // Inline chat rename state.
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    fetchChats();
    fetchPersonalities();
    fetchModels();
  }, [fetchChats, fetchPersonalities, fetchModels]);

  const handleCreateChat = () => {
    const topic = newChatTopic.trim() || "New Chat";
    createChat(topic);
    setNewChatTopic("");
  };

  const startRename = (chatId: string, currentTopic: string) => {
    setRenamingChatId(chatId);
    setRenameValue(currentTopic);
  };

  const commitRename = () => {
    if (renamingChatId && renameValue.trim()) {
      renameChat(renamingChatId, renameValue);
    }
    setRenamingChatId(null);
    setRenameValue("");
  };

  const activePersonality = personalities.find(
    (p) => p.id === activePersonalityId,
  );
  const activeModel = activePersonality
    ? models.find((m) => m.id === activePersonality.assistantModelId)
    : undefined;

  // "Selecting a personality → only see that personality's chats."
  // Chats carry the personality they were created under; filter to the
  // active one. (If nothing is selected yet, show everything.)
  const visibleChats = activePersonalityId
    ? chats.filter((c) => c.personalityId === activePersonalityId)
    : chats;

  return (
    <div className="w-56 shrink-0 flex flex-col border-r border-white/[0.06] bg-white/[0.02]">
      {/* New chat */}
      <div className="p-3 border-b border-white/[0.06]">
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="New chat topic…"
            value={newChatTopic}
            onChange={(e) => setNewChatTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateChat()}
            className="flex-1 px-2 py-1 text-xs rounded bg-white/[0.06] border border-white/[0.06] text-white/80 placeholder-white/30 outline-none"
          />
          <button
            onClick={handleCreateChat}
            className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            title="New chat"
          >
            +
          </button>
        </div>
      </div>

      {/* Chat list — filtered to the active personality */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {visibleChats.length === 0 && (
            <span className="text-xs text-white/30 text-center py-4">
              {activePersonalityId
                ? "No chats with this personality yet"
                : "No chats yet"}
            </span>
          )}
          {visibleChats.map((chat) => {
            const isRenaming = renamingChatId === chat.chatId;
            return (
              <div
                key={chat.chatId}
                className={`group flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  activeChatId === chat.chatId
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-white/60 hover:bg-white/[0.06]"
                } ${isRenaming ? "" : "cursor-pointer"}`}
                onClick={() => !isRenaming && selectChat(chat.chatId)}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        setRenamingChatId(null);
                        setRenameValue("");
                      }
                    }}
                    onBlur={commitRename}
                    className="flex-1 min-w-0 px-1 py-0.5 text-xs rounded bg-white/[0.1] border border-white/20 text-white/90 outline-none"
                  />
                ) : (
                  <span className="flex-1 truncate">{chat.topic}</span>
                )}

                {!isRenaming && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(chat.chatId, chat.topic);
                      }}
                      className="p-0.5 text-white/25 hover:text-white/70 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rename chat"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.chatId);
                      }}
                      className="p-0.5 text-white/25 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete chat"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Personality — moved down to where the model selector used to be.
          The model is part of the personality now, so there's no separate
          model switcher: pick a personality, edit it to change its model. */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Personality
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => createPersonality()}
              className="text-white/35 hover:text-white/80 transition-colors"
              title="New personality"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {activePersonalityId && (
              <button
                onClick={() => setEditingPersonality(activePersonalityId)}
                className="text-white/35 hover:text-white/80 transition-colors"
                title="Edit personality"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <select
          value={activePersonalityId || ""}
          onChange={(e) => setActivePersonality(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded bg-white/[0.06] border border-white/[0.06] text-white/85 outline-none"
        >
          <option value="" disabled>
            Select personality…
          </option>
          {personalities.map((p) => (
            <option key={p.id} value={p.id} className="bg-neutral-800">
              {p.name || p.description || p.id}
            </option>
          ))}
        </select>

        {activePersonality && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/35">
            <span>{activePersonality.gender}</span>
            <span>&middot;</span>
            <span className="truncate" title={activeModel?.visualName || activeModel?.apiName}>
              {activeModel?.visualName || activeModel?.apiName || "no model"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
