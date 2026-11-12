import { create } from "zustand";
import {
  chatApi,
  personalityApi,
  assistantModelApi,
  type Chat,
  type ChatMessage,
  type Personality,
  type AssistantModel,
} from "../lib/pibApi";
import { rosBridgeClient, ROS_TOPICS, ROS_SERVICES } from "../lib/rosApi";
import { parseRobotCommands, executeRobotCommands, getRobotControlSystemPrompt } from "../lib/aiRobotControl";

// ============== Types ==============

export const TRYB_URL_PREFIX = "https://platform.tryb.ai";
export const TRYB_CHAT_URL = `${TRYB_URL_PREFIX}/bff/tt/be/pub/api/voice-assistant/text`;

export type ModelEndpoint =
  | { type: "tryb"; apiKey: string; modelName?: string }
  | { type: "pib-backend" }
  | { type: "custom"; url: string; apiKey?: string; modelName?: string };

const STORAGE_KEYS = {
  MODEL_ENDPOINT: "pib_ai_model_endpoint",
  PERSONALITY_ID: "pib_ai_personality_id",
  VISION_ENABLED: "pib_ai_vision_enabled",
} as const;

type UnknownRecord = Record<string, unknown>;

// ============== Helpers ==============

function isModelEndpoint(value: unknown): value is ModelEndpoint {
  const data = asRecord(value);
  if (!data) return false;

  if (data.type === "pib-backend") return true;

  if (data.type === "tryb") {
    return typeof data.apiKey === "string";
  }

  if (data.type === "custom") {
    return typeof data.url === "string";
  }

  return false;
}

function isLikelyTrybTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("load failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

function loadModelEndpoint(): ModelEndpoint {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MODEL_ENDPOINT);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isModelEndpoint(parsed)) return parsed;
    }
  } catch {}

  // Default to pib-backend to avoid cross-origin issues from desktop webviews.
  return { type: "pib-backend" };
}

function saveModelEndpoint(endpoint: ModelEndpoint) {
  localStorage.setItem(STORAGE_KEYS.MODEL_ENDPOINT, JSON.stringify(endpoint));
}

function loadVisionEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.VISION_ENABLED) === "true";
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as UnknownRecord;
}

function pickArray(payload: unknown, ...keys: string[]): unknown[] {
  const data = asRecord(payload);
  if (!data) return [];
  for (const key of keys) {
    const candidate = data[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNumberValue(value: unknown, fallback = 0): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeChat(value: unknown): Chat | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const chatId = toStringValue(raw.chatId || raw.chat_id);
  if (!chatId) return null;

  return {
    chatId,
    topic: toStringValue(raw.topic, "New Chat"),
    personalityId: toStringValue(raw.personalityId || raw.personality_id),
  };
}

function normalizeChats(payload: unknown): Chat[] {
  return pickArray(payload, "chats", "voiceAssistantChats")
    .map(normalizeChat)
    .filter((chat): chat is Chat => chat !== null);
}

function normalizeMessage(value: unknown): ChatMessage | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const messageId = toStringValue(raw.messageId || raw.message_id);
  if (!messageId) return null;

  return {
    messageId,
    timestamp: toStringValue(raw.timestamp, new Date().toISOString()),
    isUser: Boolean(raw.isUser ?? raw.is_user),
    content: toStringValue(raw.content),
  };
}

function normalizeMessages(payload: unknown): ChatMessage[] {
  const data = asRecord(payload);
  if (!data) return [];

  const list = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(data.chatMessages)
      ? data.chatMessages
      : [];

  return list
    .map(normalizeMessage)
    .filter((message): message is ChatMessage => message !== null);
}

function normalizePersonality(value: unknown): Personality | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = toStringValue(raw.id || raw.personalityId || raw.personality_id);
  if (!id) return null;

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    gender: toStringValue(raw.gender, "Unknown"),
    language: toStringValue(raw.language, "German"),
    pauseThreshold: toNumberValue(
      raw.pauseThreshold ?? raw.pause_threshold,
      1
    ),
    messageHistory: toNumberValue(
      raw.messageHistory ?? raw.message_history,
      10
    ),
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    assistantModelId: toNumberValue(
      raw.assistantModelId ?? raw.assistant_model_id,
      0
    ),
  };
}

function normalizePersonalities(payload: unknown): Personality[] {
  return pickArray(payload, "personalities", "voiceAssistantPersonalities")
    .map(normalizePersonality)
    .filter((personality): personality is Personality => personality !== null);
}

function normalizeModel(value: unknown): AssistantModel | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = toNumberValue(raw.id, NaN);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    apiName: toStringValue(raw.apiName || raw.api_name),
    visualName: toStringValue(raw.visualName || raw.visual_name),
    hasImageSupport: Boolean(raw.hasImageSupport ?? raw.has_image_support),
  };
}

function normalizeModels(payload: unknown): AssistantModel[] {
  return pickArray(payload, "models", "assistantModels")
    .map(normalizeModel)
    .filter((model): model is AssistantModel => model !== null);
}

// ============== Store ==============

interface AIState {
  chats: Chat[];
  activeChatId: string | null;
  messages: ChatMessage[];
  personalities: Personality[];
  activePersonalityId: string | null;
  models: AssistantModel[];
  selectedModelId: number | null;
  modelEndpoint: ModelEndpoint;
  isThinking: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  visionEnabled: boolean;
  robotControlEnabled: boolean;
  sttText: string;
  error: string | null;

  // Internal
  _sttSubId: string | null;
  _listeningSubId: string | null;
  _chatMsgSubId: string | null;
  /** Persistent /chat_messages subscription bound to the active chat. */
  _chatStreamSubId: string | null;
  _chatStreamChatId: string | null;
  /** Timestamp of the most recent send — used to scope the "thinking"
   *  timeout so an old send can't error out a newer one. */
  _lastSendAt: number;

  /** Personality currently open in the main-area editor (null = not editing). */
  editingPersonalityId: string | null;

  fetchChats: () => Promise<void>;
  createChat: (topic: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, topic: string) => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  fetchMessages: (chatId: string) => Promise<void>;
  sendMessage: (content: string, imageBase64?: string) => Promise<void>;
  /** Start/stop the persistent assistant-message stream for a chat. */
  _startChatStream: (chatId: string) => void;
  _stopChatStream: () => void;
  fetchPersonalities: () => Promise<void>;
  setActivePersonality: (id: string) => void;
  createPersonality: () => Promise<void>;
  setEditingPersonality: (id: string | null) => void;
  fetchModels: () => Promise<void>;
  setSelectedModel: (id: number) => void;
  setModelEndpoint: (endpoint: ModelEndpoint) => void;
  updatePersonality: (id: string, updates: Partial<Personality>) => Promise<void>;
  toggleListening: () => void;
  toggleVision: () => void;
  toggleRobotControl: () => void;
  clearSttText: () => void;
  clearError: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  personalities: [],
  activePersonalityId: localStorage.getItem(STORAGE_KEYS.PERSONALITY_ID),
  editingPersonalityId: null,
  models: [],
  selectedModelId: null,
  modelEndpoint: loadModelEndpoint(),
  isThinking: false,
  isListening: false,
  isSpeaking: false,
  visionEnabled: loadVisionEnabled(),
  robotControlEnabled: localStorage.getItem("pib_ai_robot_control") === "true",
  sttText: "",
  error: null,
  _sttSubId: null,
  _listeningSubId: null,
  _chatMsgSubId: null,
  _chatStreamSubId: null,
  _chatStreamChatId: null,
  _lastSendAt: 0,

  fetchChats: async () => {
    const result = await chatApi.getAllChats();
    if (result.success && result.data) {
      set({ chats: normalizeChats(result.data), error: null });
    } else {
      set({ error: result.error || "Failed to fetch chats" });
    }
  },

  createChat: async (topic: string) => {
    const personalityId =
      get().activePersonalityId || get().personalities[0]?.id || "default";
    const result = await chatApi.createChat({ topic, personalityId });
    if (result.success && result.data) {
      const createdChat = normalizeChat(result.data);
      if (!createdChat) {
        set({ error: "Failed to parse created chat" });
        return;
      }
      set({ chats: [...get().chats, createdChat], error: null });
      await get().selectChat(createdChat.chatId); // selectChat starts the stream
    } else {
      // If backend not available, create a local-only chat
      const localChat: Chat = {
        chatId: crypto.randomUUID(),
        topic,
        personalityId,
      };
      set({ chats: [...get().chats, localChat] });
      set({ activeChatId: localChat.chatId, messages: [] });
      get()._startChatStream(localChat.chatId);
    }
  },

  // ── Persistent assistant-message stream ──────────────────────────
  // Cerebra keeps a standing subscription on the chat-message topic so
  // replies stream into the UI the moment the voice assistant publishes
  // them. We do the same: one subscription per active chat, swapped out
  // when the user switches chats. This is what makes the chat "refresh"
  // live instead of only on reload.
  _startChatStream: (chatId: string) => {
    const prev = get()._chatStreamSubId;
    if (prev) rosBridgeClient.unsubscribe(prev);

    const subId = rosBridgeClient.subscribe(
      ROS_TOPICS.CHAT_MESSAGES,
      "datatypes/ChatMessage",
      (msg: unknown) => {
        const m = msg as {
          chat_id?: string;
          content?: string;
          is_user?: boolean;
          message_id?: string;
          timestamp?: string;
        };
        // Only handle messages for the chat this stream is bound to.
        if (m?.chat_id !== get()._chatStreamChatId) return;
        if (!m?.content) return;

        const incoming: ChatMessage = {
          messageId: m.message_id || crypto.randomUUID(),
          timestamp: m.timestamp || new Date().toISOString(),
          isUser: Boolean(m.is_user),
          content: m.content,
        };

        const messages = get().messages;

        // (a) Same id we already have → streaming update of a chunked message.
        const byId = messages.findIndex((x) => x.messageId === incoming.messageId);
        if (byId >= 0) {
          const updated = [...messages];
          updated[byId] = incoming;
          set({ messages: updated });
          if (!incoming.isUser) set({ isThinking: false, error: null });
          return;
        }

        // (b) User-message echo → reconcile with the optimistic entry we
        //     showed on send (matched by content), adopting the real id.
        //     This is what stops the user's message rendering twice.
        if (incoming.isUser) {
          const optimisticIdx = messages.findIndex(
            (x) =>
              x.isUser &&
              x.messageId.startsWith("optimistic-") &&
              x.content === incoming.content,
          );
          if (optimisticIdx >= 0) {
            const updated = [...messages];
            updated[optimisticIdx] = incoming;
            set({ messages: updated });
            return;
          }
        }

        // (c) Genuinely new message → append.
        set({ messages: [...messages, incoming] });
        if (!incoming.isUser) {
          set({ isThinking: false, error: null });
        }
      },
    );

    set({ _chatStreamSubId: subId, _chatStreamChatId: chatId });
  },

  _stopChatStream: () => {
    const subId = get()._chatStreamSubId;
    if (subId) rosBridgeClient.unsubscribe(subId);
    set({ _chatStreamSubId: null, _chatStreamChatId: null });
  },

  deleteChat: async (chatId: string) => {
    const result = await chatApi.deleteChat(chatId);
    if (result.success) {
      const chats = get().chats.filter((c) => c.chatId !== chatId);
      set({ chats });
      if (get().activeChatId === chatId) {
        get()._stopChatStream();
        set({ activeChatId: null, messages: [] });
      }
    } else {
      set({ error: result.error || "Failed to delete chat" });
    }
  },

  renameChat: async (chatId: string, topic: string) => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    // Optimistic: update the list immediately, then persist.
    set({
      chats: get().chats.map((c) =>
        c.chatId === chatId ? { ...c, topic: trimmed } : c,
      ),
    });
    const result = await chatApi.updateChat(chatId, { topic: trimmed });
    if (!result.success) {
      set({ error: result.error || "Failed to rename chat" });
      // Re-sync from backend so the optimistic rename doesn't stick.
      await get().fetchChats();
    }
  },

  selectChat: async (chatId: string) => {
    set({ activeChatId: chatId, messages: [], error: null });
    // Stand up the live reply stream BEFORE fetching history, so a reply
    // that lands mid-fetch isn't lost.
    get()._startChatStream(chatId);
    await get().fetchMessages(chatId);
  },

  fetchMessages: async (chatId: string) => {
    const result = await chatApi.getMessages(chatId);
    if (result.success && result.data) {
      set({ messages: normalizeMessages(result.data), error: null });
    } else {
      set({ error: result.error || "Failed to fetch messages" });
    }
  },

  sendMessage: async (content: string, imageBase64?: string) => {
    const { activeChatId, modelEndpoint } = get();
    if (!activeChatId) {
      set({ error: "No active chat" });
      return;
    }

    set({ isThinking: true, error: null });

    const sendViaPibBackend = async (
      options: {
        optimisticMessageId?: string;
        fallbackPrefix?: string;
      } = {}
    ): Promise<boolean> => {
      if (options.optimisticMessageId) {
        set({
          messages: get().messages.filter(
            (m) => m.messageId !== options.optimisticMessageId
          ),
        });
      }

      // Make sure the persistent reply stream is up for this chat. It's
      // normally started by selectChat, but be defensive — without it the
      // AI reply (which arrives async on /chat_messages) would never render.
      if (get()._chatStreamChatId !== activeChatId) {
        get()._startChatStream(activeChatId);
      }

      // 1. Show the user's message immediately with a temporary id.
      //    We deliberately do NOT POST it to the REST API: the voice
      //    assistant's send_chat_message → chat() already persists the
      //    user message itself. Doing both wrote it to the DB twice (and
      //    rendered it twice). The persistent stream echoes the real
      //    message back, and the stream callback reconciles this
      //    optimistic entry with it (matching on content).
      const optimisticId = `optimistic-${Date.now()}`;
      set({
        messages: [
          ...get().messages,
          {
            messageId: optimisticId,
            timestamp: new Date().toISOString(),
            isUser: true,
            content,
          },
        ],
      });

      // 2. Trigger the voice assistant. It signals trouble two ways:
      //      • the ROSBridge call rejects (no service / not reachable);
      //      • the response carries `{successful: false}` (service ran but
      //        couldn't call the LLM — usually the token isn't active).
      //    Either way, surface a clear error rather than silently waiting.
      let serviceFailureReason: string | null = null;
      try {
        const result = (await rosBridgeClient.callService(
          ROS_SERVICES.SEND_CHAT_MESSAGE,
          "datatypes/srv/SendChatMessage",
          { chat_id: activeChatId, content },
          20000,
        )) as { successful?: boolean } | undefined;

        if (result && result.successful === false) {
          serviceFailureReason =
            "Voice assistant rejected the request. Most common cause: the AI access token isn't active — open Settings → AI → Smart Connect and activate it with your password.";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not connected")) {
          serviceFailureReason =
            "Not connected to the robot's ROSBridge. Check Settings → Connection.";
        } else if (msg.includes("timed out")) {
          serviceFailureReason =
            "Voice-assistant service didn't respond. Make sure the voice_assistant container is running (test-backend: ./start.sh --ai).";
        } else {
          serviceFailureReason = `send_chat_message failed: ${msg}`;
        }
        console.warn("[AI]", serviceFailureReason);
      }

      if (serviceFailureReason) {
        const prefixedError = options.fallbackPrefix
          ? `${options.fallbackPrefix} ${serviceFailureReason}`
          : serviceFailureReason;
        set({ isThinking: false, error: prefixedError });
        return false;
      }

      // 3. The AI reply arrives asynchronously on the persistent /chat_messages
      //    stream — the stream callback appends it and clears `isThinking`.
      //    Here we only arm a safety-net timeout: if nothing clears the
      //    thinking state, surface a timeout. It's scoped by `_lastSendAt`
      //    so a stale timeout can't clobber a newer in-flight send.
      const sentAt = Date.now();
      set({ _lastSendAt: sentAt });
      window.setTimeout(() => {
        if (get()._lastSendAt === sentAt && get().isThinking) {
          set({
            isThinking: false,
            error:
              "AI response timed out. Check the voice assistant is running and the token is active.",
          });
        }
      }, 75000);

      return true;
    };

    if (modelEndpoint.type === "tryb") {
      // Send directly to TRYB public API
      if (!modelEndpoint.apiKey) {
        set({ isThinking: false, error: "TRYB API key not set. Go to Settings → AI to add your key." });
        return;
      }

      // Add user message locally
      const userMsg: ChatMessage = {
        messageId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        isUser: true,
        content,
      };
      set({ messages: [...get().messages, userMsg] });

      try {
        // Build message history from current messages
        const messageHistory = get().messages.map((m) => ({
          content: m.content,
          isUser: m.isUser,
        }));

        // Get personality description if available
        const personality = get().personalities.find((p) => p.id === get().activePersonalityId);
        const description = personality?.description || "You are a helpful robot assistant.";
        const model = modelEndpoint.modelName || "gpt-3.5-turbo";

        const body: Record<string, unknown> = {
          data: content,
          messageHistory,
          personality: { description, model },
        };
        if (imageBase64) {
          body.imageBase64 = imageBase64;
        }

        const response = await fetch(TRYB_CHAT_URL, {
          method: "POST",
          headers: {
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${modelEndpoint.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const statusError =
            response.status === 401 || response.status === 403
              ? "TRYB API authentication failed. Check your API key in Settings → AI."
              : `TRYB API error: ${response.status} ${response.statusText}`;
          set({
            isThinking: false,
            error: statusError,
          });
          return;
        }

        // Read SSE stream
        let fullResponse = "";
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // Parse SSE lines: "data: ..." format
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data:")) {
                try {
                  // TRYB format: data: ...json string at position 21, ending before last char
                  const dataStr = line.slice(5).trim();
                  if (dataStr) {
                    // Try to parse as JSON first, fall back to raw text
                    try {
                      const parsed = JSON.parse(dataStr);
                      fullResponse += typeof parsed === "string" ? parsed : (parsed.content || parsed.text || JSON.stringify(parsed));
                    } catch {
                      fullResponse += dataStr;
                    }
                  }
                } catch {
                  // Skip malformed lines
                }
              }
            }
          }
        }

        const aiMsg: ChatMessage = {
          messageId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          isUser: false,
          content: fullResponse || "(No response)",
        };
        set({ messages: [...get().messages, aiMsg], isThinking: false, error: null });
      } catch (err) {
        if (isLikelyTrybTransportError(err)) {
          const fallbackEndpoint: ModelEndpoint = { type: "pib-backend" };
          set({ modelEndpoint: fallbackEndpoint });
          saveModelEndpoint(fallbackEndpoint);

          await sendViaPibBackend({
            optimisticMessageId: userMsg.messageId,
            fallbackPrefix:
              "TRYB request failed in this runtime (likely CORS/network). Switched to pib-backend automatically.",
          });
          return;
        }

        set({
          isThinking: false,
          error: `TRYB error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    } else if (modelEndpoint.type === "pib-backend") {
      await sendViaPibBackend();
    } else {
      // Custom endpoint
      try {
        const body: Record<string, unknown> = { message: content };
        if (imageBase64) body.image = imageBase64;
        if (modelEndpoint.modelName) body.model = modelEndpoint.modelName;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (modelEndpoint.apiKey) {
          headers["Authorization"] = `Bearer ${modelEndpoint.apiKey}`;
        }

        // Add user message locally
        const userMsg: ChatMessage = {
          messageId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          isUser: true,
          content,
        };
        set({ messages: [...get().messages, userMsg] });

        const response = await fetch(modelEndpoint.url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          set({
            isThinking: false,
            error: `Custom endpoint error: ${response.status} ${response.statusText}`,
          });
          return;
        }

        const data = await response.json();
        const aiMsg: ChatMessage = {
          messageId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          isUser: false,
          content: data.response || data.message || data.content || JSON.stringify(data),
        };
        set({ messages: [...get().messages, aiMsg], isThinking: false, error: null });
      } catch (err) {
        set({
          isThinking: false,
          error: `Custom endpoint error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }
  },

  fetchPersonalities: async () => {
    const result = await personalityApi.getAllPersonalities();
    if (result.success && result.data) {
      const personalities = normalizePersonalities(result.data);
      set({ personalities, error: null });
      // Auto-select first personality if none selected
      const activePersonalityId = get().activePersonalityId;
      const hasActive =
        !!activePersonalityId &&
        personalities.some((p) => p.id === activePersonalityId);
      if (!hasActive && personalities.length > 0) {
        get().setActivePersonality(personalities[0].id);
      }
    } else {
      set({ error: result.error || "Failed to fetch personalities" });
    }
  },

  setActivePersonality: (id: string) => {
    set({ activePersonalityId: id });
    localStorage.setItem(STORAGE_KEYS.PERSONALITY_ID, id);
    // Switching personality scopes the chat list to that personality.
    // The currently-open chat likely belongs to a different one, so
    // close it (and its live stream) for a clean filtered view.
    if (get().activeChatId) {
      get()._stopChatStream();
      set({ activeChatId: null, messages: [] });
    }
  },

  setEditingPersonality: (id: string | null) => {
    set({ editingPersonalityId: id });
  },

  createPersonality: async () => {
    // Sensible defaults — the user renames / tweaks it in the editor.
    // Pick the first available model so the personality is usable
    // immediately; fall back to id 1 if models haven't loaded yet.
    const defaultModelId = get().models[0]?.id ?? 1;
    const result = await personalityApi.createPersonality({
      name: "New Personality",
      description: "You are pib, a friendly humanoid robot. Keep answers short and clear.",
      gender: "Unknown",
      pauseThreshold: 0.8,
      messageHistory: 10,
      assistantModelId: defaultModelId,
    });
    if (result.success && result.data) {
      const created = normalizePersonality(result.data);
      await get().fetchPersonalities();
      if (created) {
        // Select it and drop straight into the editor in the main area.
        get().setActivePersonality(created.id);
        set({ editingPersonalityId: created.id });
      }
    } else {
      set({ error: result.error || "Failed to create personality" });
    }
  },

  fetchModels: async () => {
    const result = await assistantModelApi.getAllModels();
    if (result.success && result.data) {
      set({ models: normalizeModels(result.data), error: null });
    } else {
      set({ error: result.error || "Failed to fetch models" });
    }
  },

  setSelectedModel: (id: number) => set({ selectedModelId: id }),

  setModelEndpoint: (endpoint: ModelEndpoint) => {
    set({ modelEndpoint: endpoint });
    saveModelEndpoint(endpoint);
  },

  updatePersonality: async (id: string, updates: Partial<Personality>) => {
    // The backend schema requires the COMPLETE personality on every PUT —
    // a partial body is rejected with HTTP 400. So merge the requested
    // changes onto the current personality and send the full set.
    const current = get().personalities.find((p) => p.id === id);
    if (!current) {
      set({ error: "Personality not found" });
      return;
    }
    const merged = { ...current, ...updates };
    const result = await personalityApi.updatePersonality(id, {
      name: merged.name ?? "Personality",
      description: merged.description ?? "",
      gender: merged.gender,
      pauseThreshold: merged.pauseThreshold,
      messageHistory: merged.messageHistory,
      assistantModelId: merged.assistantModelId,
    });
    if (result.success) {
      await get().fetchPersonalities();
    } else {
      set({ error: result.error || "Failed to update personality" });
    }
  },

  toggleListening: () => {
    const { isListening, _sttSubId, _listeningSubId, _chatMsgSubId, activeChatId } = get();

    if (isListening) {
      // Turn OFF voice assistant
      if (_sttSubId) rosBridgeClient.unsubscribe(_sttSubId);
      if (_listeningSubId) rosBridgeClient.unsubscribe(_listeningSubId);
      if (_chatMsgSubId) rosBridgeClient.unsubscribe(_chatMsgSubId);
      set({ isListening: false, isSpeaking: false, _sttSubId: null, _listeningSubId: null, _chatMsgSubId: null });

      // Call ROS service to turn off the voice assistant
      rosBridgeClient.callService(
        ROS_SERVICES.SET_VOICE_ASSISTANT_STATE,
        "datatypes/srv/SetVoiceAssistantState",
        {
          voice_assistant_state: {
            turned_on: false,
            chat_id: activeChatId || "",
          },
        }
      ).catch(() => {
        // Fallback: also publish on topic for older backends
        rosBridgeClient.publish(
          ROS_TOPICS.VOICE_ASSISTANT_STATE,
          "datatypes/VoiceAssistantState",
          { turned_on: false, chat_id: activeChatId || "" }
        );
      });
    } else {
      if (!activeChatId) {
        set({ error: "Select or create a chat first" });
        return;
      }

      // Subscribe to chat_is_listening topic to track listening state
      const listeningSubId = rosBridgeClient.subscribe(
        ROS_TOPICS.CHAT_IS_LISTENING,
        "datatypes/ChatIsListening",
        (msg: unknown) => {
          const m = msg as { chat_id?: string; listening?: boolean };
          if (m?.chat_id === get().activeChatId) {
            set({ isListening: !!m.listening });
          }
        }
      );

      // Subscribe to chat_messages for real-time AI responses
      const chatMsgSubId = rosBridgeClient.subscribe(
        ROS_TOPICS.CHAT_MESSAGES,
        "datatypes/ChatMessage",
        (msg: unknown) => {
          const m = msg as {
            chat_id?: string;
            content?: string;
            is_user?: boolean;
            message_id?: string;
            timestamp?: string;
          };
          if (m?.chat_id !== get().activeChatId || !m?.content) return;

          const chatMsg: ChatMessage = {
            messageId: m.message_id || crypto.randomUUID(),
            timestamp: m.timestamp || new Date().toISOString(),
            isUser: !!m.is_user,
            content: m.content,
          };

          // If user message via STT, clear sttText
          if (chatMsg.isUser) {
            set({ sttText: "" });
          } else {
            set({ isSpeaking: true });
          }

          const messages = get().messages;
          const existingIdx = messages.findIndex(
            (msg) => msg.messageId === chatMsg.messageId
          );
          if (existingIdx >= 0) {
            const updated = [...messages];
            updated[existingIdx] = chatMsg;
            set({ messages: updated });
          } else {
            set({ messages: [...messages, chatMsg], isThinking: false });
          }
        }
      );

      // Subscribe to STT text for live transcription display
      const sttSubId = rosBridgeClient.subscribe(
        ROS_TOPICS.STT_TEXT,
        "std_msgs/String",
        (msg: unknown) => {
          const m = msg as { data?: string };
          if (m?.data) {
            set({ sttText: m.data });
          }
        }
      );

      set({
        isListening: true,
        _sttSubId: sttSubId,
        _listeningSubId: listeningSubId,
        _chatMsgSubId: chatMsgSubId,
      });

      // Call ROS service to turn ON the voice assistant with active chat
      rosBridgeClient.callService(
        ROS_SERVICES.SET_VOICE_ASSISTANT_STATE,
        "datatypes/srv/SetVoiceAssistantState",
        {
          voice_assistant_state: {
            turned_on: true,
            chat_id: activeChatId,
          },
        }
      ).catch(() => {
        // Fallback: publish on topic for older backends
        rosBridgeClient.publish(
          ROS_TOPICS.VOICE_ASSISTANT_STATE,
          "datatypes/VoiceAssistantState",
          { turned_on: true, chat_id: activeChatId }
        );
      });
    }
  },

  toggleVision: () => {
    const next = !get().visionEnabled;
    set({ visionEnabled: next });
    localStorage.setItem(STORAGE_KEYS.VISION_ENABLED, String(next));
  },

  toggleRobotControl: () => {
    const next = !get().robotControlEnabled;
    set({ robotControlEnabled: next });
    localStorage.setItem("pib_ai_robot_control", String(next));
  },

  clearSttText: () => set({ sttText: "" }),
  clearError: () => set({ error: null }),
}));

/**
 * Process an AI response for embedded robot commands.
 * Call this after receiving an AI message to execute any commands.
 */
/**
 * Pure: the text to *display* for an AI message — robot-command markup
 * stripped out. No side effects, so it's safe to recompute on every render
 * (which is what makes streamed AI messages update live in the UI).
 */
export function cleanAIResponseText(content: string): string {
  if (!useAIStore.getState().robotControlEnabled) return content;
  return parseRobotCommands(content).cleanText;
}

/**
 * Side effect: parse and execute any robot commands embedded in an AI
 * message. Must be called at most once per message — see ChatMessage,
 * which defers this until the streamed content has settled.
 */
export function executeAIRobotCommands(content: string): void {
  if (!useAIStore.getState().robotControlEnabled) return;
  const { commands } = parseRobotCommands(content);
  if (commands.length > 0) {
    executeRobotCommands(commands).catch(console.error);
  }
}

/** Get system prompt with robot control instructions if enabled. */
export function getAISystemPrompt(): string | undefined {
  const { robotControlEnabled } = useAIStore.getState();
  if (!robotControlEnabled) return undefined;
  return getRobotControlSystemPrompt();
}
