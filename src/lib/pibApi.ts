import { jointToMotorName } from "./jointConfig";

// PIB Backend API Client
// Based on pib-backend-main API structure

function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_PIB_API_URL;
  if (envUrl) return envUrl;

  // In dev mode, use the Vite proxy at /pib-api to avoid CORS preflight failures.
  // Configure the proxy target via: PIB_ROBOT_URL=http://192.168.1.100:5000 pnpm dev
  if ((import.meta as any).env?.DEV) {
    return "/pib-api";
  }

  const robotIp = localStorage.getItem("pibRobotIp");
  const robotPort = localStorage.getItem("pibRobotApiPort") || "5000";
  if (robotIp) return `http://${robotIp}:${robotPort}`;

  return `http://${window.location.hostname}:5000`;
}

// Debug flag - can be toggled in DevTools console
const DEBUG = {
  enabled: localStorage.getItem("pibApiDebug") === "true",
  log: (msg: string, data?: any) => {
    if (DEBUG.enabled) {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
      console.log(`[${timestamp}] 🤖 PIB API:`, msg, data || "");
    }
  },
  error: (msg: string, data?: any) => {
    if (DEBUG.enabled) {
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
      console.error(`[${timestamp}] ❌ PIB API:`, msg, data || "");
    }
  },
};

// Enable/Disable debugging from console: localStorage.setItem("pibApiDebug", "true")
(window as any).pibDebug = {
  enable: () => {
    localStorage.setItem("pibApiDebug", "true");
    DEBUG.enabled = true;
    console.log("✅ PIB API Debugging ENABLED");
    console.log("ℹ️ Try dragging a joint now to see debug logs");
  },
  disable: () => {
    localStorage.setItem("pibApiDebug", "false");
    DEBUG.enabled = false;
    console.log("❌ PIB API Debugging DISABLED");
  },
  status: () => {
    console.log("📊 Debug Status:", {
      enabled: DEBUG.enabled,
      storageSetting: localStorage.getItem("pibApiDebug"),
    });
  },
};

// Initial status check
if (DEBUG.enabled) {
  console.log("✅ PIB API Debugging is ENABLED (from localStorage)");
  console.log("ℹ️ Move mouse over robot joints and drag to test");
} else {
  console.log("❌ PIB API Debugging is DISABLED - Click the orange debug button or use pibDebug.enable()");
}

// In dev mode, sync the persisted robot IP to the Vite dev proxy on startup.
// This allows the IP set in Settings to survive page reloads without restarting the dev server.
if ((import.meta as any).env?.DEV) {
  const storedIp = localStorage.getItem("pibRobotIp");
  const storedPort = localStorage.getItem("pibRobotApiPort") || "5000";
  if (storedIp) {
    fetch("/__pib_config__", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotUrl: `http://${storedIp}:${storedPort}` }),
    }).catch(() => {});
  }
}

/**
 * In dev mode, updates the Vite dev proxy target so API calls are forwarded
 * to the new robot URL immediately — no server restart required.
 * No-op in production.
 */
export async function updateDevProxyUrl(ip: string, port: string): Promise<void> {
  if (!(import.meta as any).env?.DEV) return;
  try {
    await fetch("/__pib_config__", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robotUrl: `http://${ip}:${port}` }),
    });
  } catch {
    // Silently ignore — proxy endpoint only available when dev server is running
  }
}

// Generic request helper
async function apiRequest<T>(
  endpoint: string,
  method: string = "GET",
  body?: object
): Promise<{ success: boolean; data?: T; error?: string }> {
  const startTime = performance.now();
  const url = `${getApiBaseUrl()}${endpoint}`;

  try {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    DEBUG.log(`→ ${method} ${endpoint}`, body);

    const response = await fetch(url, options);
    const duration = (performance.now() - startTime).toFixed(1);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.error ||
        errorData.message ||
        errorData.description ||
        `HTTP ${response.status}: ${response.statusText}`;
      DEBUG.error(`← ${method} ${endpoint} (${duration}ms) ${response.status}`, errorMsg);

      return {
        success: false,
        error: errorMsg,
      };
    }

    // Handle 204 No Content
    if (response.status === 204) {
      DEBUG.log(`← ${method} ${endpoint} (${duration}ms) 204 No Content`);
      return { success: true, data: undefined as T };
    }

    const data = await response.json();
    DEBUG.log(`← ${method} ${endpoint} (${duration}ms) ${response.status}`, data);
    return { success: true, data };
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(1);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    DEBUG.error(`← ${method} ${endpoint} (${duration}ms) NETWORK ERROR`, errorMsg);

    return {
      success: false,
      error: errorMsg,
    };
  }
}

// Generic multipart/form-data request helper (for file uploads with progress)
async function apiRequestMultipart<T>(
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; data?: T; error?: string }> {
  const url = `${getApiBaseUrl()}${endpoint}`;
  try {
    DEBUG.log(`→ POST (multipart) ${endpoint}`);

    const xhr = new XMLHttpRequest();
    const result = await new Promise<{ success: boolean; data?: T; error?: string }>((resolve) => {
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
          DEBUG.log(`← POST (multipart) ${endpoint} ${xhr.status}`, data);
          resolve({ success: true, data });
        } else {
          const errorMsg = `HTTP ${xhr.status}: ${xhr.statusText}`;
          DEBUG.error(`← POST (multipart) ${endpoint} ${xhr.status}`, errorMsg);
          resolve({ success: false, error: errorMsg });
        }
      };
      xhr.onerror = () => resolve({ success: false, error: "Network error" });
      xhr.open("POST", url);
      xhr.send(formData);
    });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    DEBUG.error(`← POST (multipart) ${endpoint} ERROR`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ============== MOTOR API ==============

export interface MotorSettings {
  name: string;
  turnedOn: boolean;
  pulseWidthMin: number;
  pulseWidthMax: number;
  rotationRangeMin: number;
  rotationRangeMax: number;
  velocity: number;
  acceleration: number;
  deceleration: number;
  period: number;
  visible: boolean;
  invert: boolean;
}

export interface Motor {
  name: string;
  settings: MotorSettings;
  brickletPins: BrickletPin[];
  position?: number;
  currentPosition?: number;
  current_position?: number;
  centidegrees?: number;
  value?: number;
}

export interface BrickletPin {
  pinNumber: number;
  brickletNumber: number;
}

type RawBrickletPin = BrickletPin | {
  pin?: number;
  pinNumber?: number;
  bricklet?: string | number;
  brickletNumber?: string | number;
};

type RawMotor = Partial<MotorSettings> & {
  name?: string;
  settings?: Partial<MotorSettings>;
  brickletPins?: RawBrickletPin[];
  position?: number;
  currentPosition?: number;
  current_position?: number;
  centidegrees?: number;
  value?: number;
};

function normalizeBrickletPin(pin: RawBrickletPin): BrickletPin | null {
  const pinNumber = Number("pinNumber" in pin ? pin.pinNumber : pin.pin);
  const brickletNumber = Number(
    "brickletNumber" in pin ? pin.brickletNumber : pin.bricklet
  );

  if (!Number.isFinite(pinNumber) || !Number.isFinite(brickletNumber)) {
    return null;
  }

  return {
    pinNumber: Math.round(pinNumber),
    brickletNumber: Math.round(brickletNumber),
  };
}

function normalizeMotorSettings(raw: RawMotor): MotorSettings {
  const source = raw.settings && typeof raw.settings === "object"
    ? { ...raw, ...raw.settings }
    : raw;

  return {
    name: source.name ?? "",
    turnedOn: Boolean(source.turnedOn),
    pulseWidthMin: Number(source.pulseWidthMin ?? 0),
    pulseWidthMax: Number(source.pulseWidthMax ?? 0),
    rotationRangeMin: Number(source.rotationRangeMin ?? -9000),
    rotationRangeMax: Number(source.rotationRangeMax ?? 9000),
    velocity: Number(source.velocity ?? 0),
    acceleration: Number(source.acceleration ?? 0),
    deceleration: Number(source.deceleration ?? 0),
    period: Number(source.period ?? 0),
    visible: Boolean(source.visible),
    invert: Boolean(source.invert),
  };
}

function normalizeMotor(raw: RawMotor): Motor {
  return {
    name: raw.name ?? raw.settings?.name ?? "",
    settings: normalizeMotorSettings(raw),
    brickletPins: Array.isArray(raw.brickletPins)
      ? raw.brickletPins
          .map(normalizeBrickletPin)
          .filter((pin): pin is BrickletPin => pin !== null)
      : [],
    position: typeof raw.position === "number" ? raw.position : undefined,
    currentPosition: typeof raw.currentPosition === "number" ? raw.currentPosition : undefined,
    current_position: typeof raw.current_position === "number" ? raw.current_position : undefined,
    centidegrees: typeof raw.centidegrees === "number" ? raw.centidegrees : undefined,
    value: typeof raw.value === "number" ? raw.value : undefined,
  };
}

export const motorApi = {
  // GET /motor - Get all motors
  getAllMotors: async () => {
    const result = await apiRequest<{ motors: RawMotor[] }>("/motor");
    if (!result.success || !result.data) {
      return result as { success: false; error?: string };
    }

    return {
      success: true as const,
      data: {
        motors: result.data.motors.map(normalizeMotor),
      },
    };
  },

  // GET /motor/:name - Get single motor
  getMotor: async (name: string) => {
    const result = await apiRequest<RawMotor>(`/motor/${name}`);
    if (!result.success || !result.data) {
      return result as { success: false; error?: string };
    }

    return {
      success: true as const,
      data: normalizeMotor(result.data),
    };
  },

  // PUT /motor/:name - Update motor
  updateMotor: (name: string, motor: Partial<Motor>) =>
    apiRequest<Motor>(`/motor/${name}`, "PUT", motor),

  // GET /motor/:name/settings - Get motor settings
  getMotorSettings: (name: string) =>
    apiRequest<MotorSettings>(`/motor/${name}/settings`),

  // PUT /motor/:name/settings - Update motor settings
  updateMotorSettings: (name: string, settings: Partial<MotorSettings>) =>
    apiRequest<MotorSettings>(`/motor/${name}/settings`, "PUT", settings),

  // GET /motor/:name/bricklet-pins - Get motor bricklet pins
  getMotorBrickletPins: (name: string) =>
    apiRequest<BrickletPin[]>(`/motor/${name}/bricklet-pins`),

  // PUT /motor/:name/bricklet-pins - Update motor bricklet pins
  updateMotorBrickletPins: (name: string, pins: BrickletPin[]) =>
    apiRequest<BrickletPin[]>(`/motor/${name}/bricklet-pins`, "PUT", { bricklet_pins: pins }),

  // Send motor position command (via ROS or direct API)
  setMotorPosition: (motorName: string, position: number) =>
    apiRequest<void>(`/motor/${motorName}/position`, "PUT", { position }),
};

// ============== POSE API ==============

export interface Pose {
  id: string;
  name: string;
  motorPositions: Record<string, number>;
}

interface MotorPositionDTO {
  motorName: string;
  position: number;
}

interface BackendPoseDTO {
  id?: string;
  poseId?: string;
  name: string;
  motorPositions?: Record<string, number> | MotorPositionDTO[];
}

function normalizeMotorPositionRecord(
  motorPositions: unknown
): Record<string, number> {
  if (Array.isArray(motorPositions)) {
    const normalized: Record<string, number> = {};
    for (const entry of motorPositions) {
      const raw = entry as Partial<MotorPositionDTO>;
      if (typeof raw.motorName !== "string") continue;
      const position = Number(raw.position);
      if (!Number.isFinite(position)) continue;
      normalized[raw.motorName] = Math.round(position);
    }
    return normalized;
  }

  if (motorPositions && typeof motorPositions === "object") {
    const normalized: Record<string, number> = {};
    for (const [key, value] of Object.entries(motorPositions as Record<string, unknown>)) {
      const position = Number(value);
      if (!Number.isFinite(position)) continue;
      normalized[key] = Math.round(position);
    }
    return normalized;
  }

  return {};
}

function normalizePose(dto: BackendPoseDTO): Pose {
  return {
    id: dto.id ?? dto.poseId ?? crypto.randomUUID(),
    name: dto.name,
    motorPositions: normalizeMotorPositionRecord(dto.motorPositions),
  };
}

function encodeMotorPositionsForBackend(
  motorPositions: Record<string, number>
): MotorPositionDTO[] {
  const seen = new Set<string>();
  const encoded: MotorPositionDTO[] = [];

  for (const [key, rawPosition] of Object.entries(motorPositions)) {
    const motorName = jointToMotorName[key] ?? key;
    if (seen.has(motorName)) continue;

    const position = Number(rawPosition);
    if (!Number.isFinite(position)) continue;

    seen.add(motorName);
    encoded.push({ motorName, position: Math.round(position) });
  }

  return encoded;
}

export const poseApi = {
  // GET /pose - Get all poses
  getAllPoses: async () => {
    const result = await apiRequest<{ poses: BackendPoseDTO[] }>("/pose");
    if (!result.success || !result.data) {
      return result as { success: false; error?: string };
    }

    return {
      success: true as const,
      data: { poses: result.data.poses.map(normalizePose) },
    };
  },

  // POST /pose - Create new pose
  createPose: async (pose: { name: string; motorPositions: Record<string, number> }) => {
    const result = await apiRequest<BackendPoseDTO>("/pose", "POST", {
      name: pose.name,
      motorPositions: encodeMotorPositionsForBackend(pose.motorPositions),
    });

    if (!result.success || !result.data) {
      return result as { success: false; error?: string };
    }

    return {
      success: true as const,
      data: normalizePose(result.data),
    };
  },

  // GET /pose/:id/motor-positions - Get motor positions of a pose
  getMotorPositionsOfPose: async (poseId: string) => {
    const result = await apiRequest<{ motorPositions: Record<string, number> | MotorPositionDTO[] }>(
      `/pose/${poseId}/motor-positions`
    );

    if (!result.success || !result.data) {
      return result as { success: false; error?: string };
    }

    return {
      success: true as const,
      data: normalizeMotorPositionRecord(result.data.motorPositions),
    };
  },

  // DELETE /pose/:id - Delete pose
  deletePose: (poseId: string) => apiRequest<void>(`/pose/${poseId}`, "DELETE"),

  // PATCH /pose/:id - Rename pose
  renamePose: (poseId: string, name: string) =>
    apiRequest<Pose>(`/pose/${poseId}`, "PATCH", { name }),

  // Apply pose to robot
  applyPose: async (poseId: string) => {
    const result = await poseApi.getMotorPositionsOfPose(poseId);
    if (result.success && result.data) {
      // Apply all motor positions
      const positions = result.data;
      for (const [motorName, position] of Object.entries(positions)) {
        await motorApi.setMotorPosition(motorName, position);
      }
    }
    return result;
  },
};

// ============== BRICKLET API ==============

export interface Bricklet {
  brickletNumber: number;
  brickletType: string;
  motorNames: string[];
}

export const brickletApi = {
  // GET /bricklet - Get all bricklets
  getAllBricklets: () => apiRequest<{ bricklets: Bricklet[] }>("/bricklet"),

  // GET /bricklet/:number - Get single bricklet
  getBricklet: (brickletNumber: number | string) =>
    apiRequest<Bricklet>(`/bricklet/${brickletNumber}`),

  // PUT /bricklet/:number - Update bricklet
  updateBricklet: (brickletNumber: number | string, bricklet: Partial<Bricklet>) =>
    apiRequest<Bricklet>(`/bricklet/${brickletNumber}`, "PUT", bricklet),
};

// ============== CAMERA API ==============

export interface CameraSettings {
  // New pib-backend camera settings schema
  resolution?: string;
  refreshRate?: number;
  qualityFactor?: number;
  resX?: number;
  resY?: number;
  // Legacy/alternative camera settings schema
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
}

export const cameraApi = {
  // GET /camera-settings - Get camera settings
  getCameraSettings: () => apiRequest<CameraSettings>("/camera-settings"),

  // PUT /camera-settings - Update camera settings
  updateCameraSettings: (settings: Partial<CameraSettings>) =>
    apiRequest<CameraSettings>("/camera-settings", "PUT", settings),
};

// ============== MEDIA FILE API ==============

export interface MediaFile {
  name: string;
  url: string;
  size?: number;
  thumbnail?: string;
}

export const mediaApi = {
  // Face files
  listFaces: () => apiRequest<{ files: MediaFile[] }>("/media/faces"),
  uploadFace: (formData: FormData, onProgress?: (percent: number) => void) =>
    apiRequestMultipart<MediaFile>("/media/faces", formData, onProgress),
  deleteFace: (filename: string) =>
    apiRequest<void>(`/media/faces/${encodeURIComponent(filename)}`, "DELETE"),

  // Audio files
  listAudio: () => apiRequest<{ files: MediaFile[] }>("/media/audio"),
  uploadAudio: (formData: FormData, onProgress?: (percent: number) => void) =>
    apiRequestMultipart<MediaFile>("/media/audio", formData, onProgress),
  deleteAudio: (filename: string) =>
    apiRequest<void>(`/media/audio/${encodeURIComponent(filename)}`, "DELETE"),

  // Video files
  listVideos: () => apiRequest<{ files: MediaFile[] }>("/media/video"),
  uploadVideo: (formData: FormData, onProgress?: (percent: number) => void) =>
    apiRequestMultipart<MediaFile>("/media/video", formData, onProgress),
  deleteVideo: (filename: string) =>
    apiRequest<void>(`/media/video/${encodeURIComponent(filename)}`, "DELETE"),
};

// ============== CHAT / VOICE ASSISTANT API ==============

export interface Chat {
  chatId: string;
  topic: string;
  personalityId: string;
}

export interface ChatMessage {
  messageId: string;
  timestamp: string;
  isUser: boolean;
  content: string;
}

export interface Personality {
  id: string;
  name?: string;
  gender: string;
  language: string;
  pauseThreshold: number;
  messageHistory: number;
  description?: string;
  assistantModelId: number;
}

/**
 * The exact field set the pib-backend personality schema requires on
 * create/update — all mandatory, all camelCase. `id` and `language` are
 * intentionally excluded (id is in the URL; language is frontend-only).
 */
export interface PersonalityWritePayload {
  name: string;
  description: string;
  gender: string;
  pauseThreshold: number;
  messageHistory: number;
  assistantModelId: number;
}

export const chatApi = {
  // GET /voice-assistant/chat - Get all chats
  getAllChats: () =>
    apiRequest<{ chats?: Chat[]; voiceAssistantChats?: Chat[] }>(
      "/voice-assistant/chat"
    ),

  // POST /voice-assistant/chat - Create new chat
  // NOTE: pib-backend's marshmallow schemas use camelCase external keys
  // (SQLAutoWithCamelCaseSchema → on_bind_field runs camelcase()). Sending
  // snake_case here gets rejected with HTTP 400 "Bad request".
  createChat: (chat: { topic: string; personalityId: string }) =>
    apiRequest<Chat>("/voice-assistant/chat", "POST", {
      topic: chat.topic,
      personalityId: chat.personalityId,
    }),

  // GET /voice-assistant/chat/:id - Get chat by ID
  getChat: (chatId: string) => apiRequest<Chat>(`/voice-assistant/chat/${chatId}`),

  // PUT /voice-assistant/chat/:id - Update chat
  updateChat: (chatId: string, chat: Partial<Chat>) =>
    apiRequest<Chat>(`/voice-assistant/chat/${chatId}`, "PUT", {
      topic: chat.topic,
      ...(chat.personalityId ? { personalityId: chat.personalityId } : {}),
    }),

  // DELETE /voice-assistant/chat/:id - Delete chat
  deleteChat: (chatId: string) =>
    apiRequest<void>(`/voice-assistant/chat/${chatId}`, "DELETE"),

  // GET /voice-assistant/chat/:id/messages - Get all messages
  getMessages: (chatId: string) =>
    apiRequest<{ messages: ChatMessage[] }>(`/voice-assistant/chat/${chatId}/messages`),

  // POST /voice-assistant/chat/:id/messages - Create message
  // camelCase keys — see createChat note above.
  createMessage: (chatId: string, message: { isUser: boolean; content: string }) =>
    apiRequest<ChatMessage>(`/voice-assistant/chat/${chatId}/messages`, "POST", {
      isUser: message.isUser,
      content: message.content,
    }),

  // GET /voice-assistant/chat/:id/messages/:messageId - Get single message
  getMessage: (chatId: string, messageId: string) =>
    apiRequest<ChatMessage>(`/voice-assistant/chat/${chatId}/messages/${messageId}`),

  // DELETE /voice-assistant/chat/:id/messages/:messageId - Delete message
  deleteMessage: (chatId: string, messageId: string) =>
    apiRequest<void>(`/voice-assistant/chat/${chatId}/messages/${messageId}`, "DELETE"),
};

export const personalityApi = {
  // GET /voice-assistant/personality/:id - Get personality
  getPersonality: (personalityId: string) =>
    apiRequest<Personality>(`/voice-assistant/personality/${personalityId}`),

  // PUT /voice-assistant/personality/:id - Update personality
  // pib-backend's marshmallow schema (upload_personality_schema) is an
  // AUTO-schema over the full model — it requires ALL fields, every time.
  // A partial body → HTTP 400 "Bad request". So the caller MUST pass a
  // complete personality; this just maps it to the camelCase keys the
  // backend expects. `language` is frontend-only and intentionally omitted.
  updatePersonality: (personalityId: string, personality: PersonalityWritePayload) =>
    apiRequest<Personality>(`/voice-assistant/personality/${personalityId}`, "PUT", {
      name: personality.name,
      description: personality.description,
      gender: personality.gender,
      pauseThreshold: personality.pauseThreshold,
      messageHistory: personality.messageHistory,
      assistantModelId: personality.assistantModelId,
    }),

  // POST /voice-assistant/personality - Create new personality
  // Same all-fields-required rule as updatePersonality.
  createPersonality: (personality: PersonalityWritePayload) =>
    apiRequest<Personality>("/voice-assistant/personality", "POST", {
      name: personality.name,
      description: personality.description,
      gender: personality.gender,
      pauseThreshold: personality.pauseThreshold,
      messageHistory: personality.messageHistory,
      assistantModelId: personality.assistantModelId,
    }),

  // DELETE /voice-assistant/personality/:id - Delete personality
  deletePersonality: (personalityId: string) =>
    apiRequest<void>(`/voice-assistant/personality/${personalityId}`, "DELETE"),

  // GET /voice-assistant/personality - Get all personalities
  getAllPersonalities: () =>
    apiRequest<{
      personalities?: Personality[];
      voiceAssistantPersonalities?: Personality[];
    }>("/voice-assistant/personality"),
};

// ============== PROGRAM API ==============

export interface Program {
  id: string;
  name: string;
  code: string;
}

export const programApi = {
  // GET /program - Get all programs
  getAllPrograms: () => apiRequest<{ programs: Program[] }>("/program"),

  // POST /program - Create program
  createProgram: (program: { name: string; code: string }) =>
    apiRequest<Program>("/program", "POST", program),

  // GET /program/:id - Get program
  getProgram: (programId: string) => apiRequest<Program>(`/program/${programId}`),

  // PUT /program/:id - Update program
  updateProgram: (programId: string, program: Partial<Program>) =>
    apiRequest<Program>(`/program/${programId}`, "PUT", program),

  // DELETE /program/:id - Delete program
  deleteProgram: (programId: string) => apiRequest<void>(`/program/${programId}`, "DELETE"),

  // POST /program/:id/run - Run program
  runProgram: (programId: string) => apiRequest<void>(`/program/${programId}/run`, "POST"),
};

// ============== ASSISTANT MODEL API ==============

export interface AssistantModel {
  id: number;
  apiName: string;
  visualName: string;
  hasImageSupport: boolean;
}

export const assistantModelApi = {
  // GET /assistant-model - Get all assistant models
  getAllModels: () =>
    apiRequest<{ models?: AssistantModel[]; assistantModels?: AssistantModel[] }>(
      "/assistant-model"
    ),

  // GET /assistant-model/:id - Get assistant model
  getAssistantModel: (modelId: number) =>
    apiRequest<AssistantModel>(`/assistant-model/${modelId}`),
};

// ============== HOST IP API ==============

export const hostIpApi = {
  // GET /host-ip - Get host IP
  getHostIp: () =>
    apiRequest<{ ip?: string; hostIp?: string; host_ip?: string }>("/host-ip"),
};

// Check if mock mode is enabled
function isMockMode(): boolean {
  return localStorage.getItem("pibMockMode") === "true";
}

// ============== HEALTH CHECK API ==============

export const healthApi = {
  // Test connection to backend
  checkHealth: async (): Promise<{ success: boolean; error?: string }> => {
    if (isMockMode()) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${getApiBaseUrl()}/motor`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Robot backend is not responding" };
      }
      return { success: false, error: error instanceof Error ? error.message : "Robot backend is not responding" };
    }
  },
};

// ============== JOINT TRAJECTORY API (ROS Bridge) ==============

export interface JointTrajectory {
  jointNames: string[];
  positions: number[];
}

export const jointTrajectoryApi = {
  // POST /joint-trajectory - Apply joint trajectory to multiple motors
  applyJointTrajectory: (trajectory: JointTrajectory) =>
    apiRequest<void>("/joint-trajectory", "POST", trajectory),

  // Apply trajectory from joint ID to motor name mapping
  applyJointPositions: async (jointPositions: Record<string, number>) => {
    const motorPositions: Record<string, number> = {};

    // Map joint IDs to motor names
    for (const [jointId, position] of Object.entries(jointPositions)) {
      // You may need to adjust this mapping based on your motor naming
      motorPositions[jointId] = position;
    }

    // Send to all motors
    const results = await Promise.all(
      Object.entries(motorPositions).map(([name, pos]) =>
        motorApi.setMotorPosition(name, pos)
      )
    );

    const allSuccess = results.every((r) => r.success);
    return {
      success: allSuccess,
      error: allSuccess ? undefined : "Some motors failed to update",
    };
  },
};

// ============== VOICE ASSISTANT STATE API ==============

export interface VoiceAssistantState {
  enabled: boolean;
  chatId: string | null;
}

export const voiceAssistantApi = {
  // GET /voice-assistant/state - Get voice assistant state
  getState: () =>
    apiRequest<VoiceAssistantState>("/voice-assistant/state"),

  // PUT /voice-assistant/state - Set voice assistant state
  setState: (enabled: boolean, chatId?: string) =>
    apiRequest<VoiceAssistantState>("/voice-assistant/state", "PUT", {
      enabled,
      ...(chatId !== undefined ? { chatId } : {}),
    }),
};

// Export all APIs
export const pibApi = {
  motor: motorApi,
  pose: poseApi,
  bricklet: brickletApi,
  camera: cameraApi,
  media: mediaApi,
  chat: chatApi,
  personality: personalityApi,
  program: programApi,
  assistantModel: assistantModelApi,
  hostIp: hostIpApi,
  jointTrajectory: jointTrajectoryApi,
  health: healthApi,
  voiceAssistant: voiceAssistantApi,
};

export default pibApi;
