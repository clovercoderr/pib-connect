import { create } from "zustand";
import { cameraApi, type CameraSettings } from "../lib/pibApi";
import { rosBridgeClient, ROS_TOPICS } from "../lib/rosApi";

interface CameraState {
  isStreaming: boolean;
  streamUrl: string | null;
  frameData: string | null;
  settings: CameraSettings | null;
  streamMode: "mjpeg" | "rosbridge";
  error: string | null;

  startStream: () => void;
  stopStream: () => void;
  startRosBridgeStream: (fallbackReason?: string) => void;
  stopRosBridgeStream: () => void;
  fetchSettings: () => Promise<void>;
  updateSettings: (partial: Partial<CameraSettings>) => Promise<void>;
}

let rosBridgeSubIds: string[] = [];
let rosBridgeFrameTimeout: ReturnType<typeof setTimeout> | null = null;

// Frame throttling - limit to ~15fps to keep UI responsive
let lastFrameTime = 0;
const MIN_FRAME_INTERVAL_MS = 66; // ~15fps

function clearRosBridgeSubscriptions() {
  if (rosBridgeSubIds.length === 0) return;
  for (const subId of rosBridgeSubIds) {
    rosBridgeClient.unsubscribe(subId);
  }
  rosBridgeSubIds = [];
}

function clearRosBridgeFrameWatchdog() {
  if (rosBridgeFrameTimeout) {
    clearTimeout(rosBridgeFrameTimeout);
    rosBridgeFrameTimeout = null;
  }
}

function buildMjpegUrl(): string {
  const robotIp = localStorage.getItem("pibRobotIp") || window.location.hostname;
  const mjpegPort = localStorage.getItem("pibMjpegPort") || "8080";
  return `http://${robotIp}:${mjpegPort}/stream`;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  isStreaming: false,
  streamUrl: null,
  frameData: null,
  settings: null,
  streamMode: "mjpeg",
  error: null,

  startStream: () => {
    const url = buildMjpegUrl();
    set({
      isStreaming: true,
      streamUrl: url,
      streamMode: "mjpeg",
      frameData: null,
      error: null,
    });
  },

  stopStream: () => {
    clearRosBridgeSubscriptions();
    clearRosBridgeFrameWatchdog();
    set({
      isStreaming: false,
      streamUrl: null,
      frameData: null,
    });
  },

  startRosBridgeStream: (fallbackReason?: string) => {
    clearRosBridgeSubscriptions();
    clearRosBridgeFrameWatchdog();
    lastFrameTime = 0;

    let receivedFrame = false;

    const onFrameMessage = (msg: unknown) => {
      // Throttle: skip frames that arrive faster than our target fps
      const now = performance.now();
      if (now - lastFrameTime < MIN_FRAME_INTERVAL_MS) return;
      lastFrameTime = now;

      const frame = msg as { data?: unknown; format?: string };
      if (typeof frame.data !== "string") return;

      const rawData = frame.data.trim();
      if (!rawData) return;

      if (rawData.toLowerCase().startsWith("camera not available")) {
        set({ error: "Camera backend reports that no camera device is available." });
        return;
      }

      const normalizedFrame = rawData.startsWith("data:image")
        ? rawData
        : `data:image/jpeg;base64,${rawData}`;

      if (!receivedFrame) {
        receivedFrame = true;
        clearRosBridgeFrameWatchdog();
      }
      set({ frameData: normalizedFrame, error: null });
    };

    rosBridgeSubIds = [
      rosBridgeClient.subscribe(
        ROS_TOPICS.CAMERA_IMAGE_COMPRESSED,
        "sensor_msgs/CompressedImage",
        onFrameMessage
      ),
      rosBridgeClient.subscribe(
        ROS_TOPICS.CAMERA_TOPIC,
        "std_msgs/String",
        onFrameMessage
      ),
      rosBridgeClient.subscribe(
        ROS_TOPICS.CAMERA_TOPIC_LEGACY,
        "std_msgs/String",
        onFrameMessage
      ),
    ];

    set({
      isStreaming: true,
      streamMode: "rosbridge",
      streamUrl: null,
      frameData: null,
      error: fallbackReason || null,
    });

    // Longer watchdog (8s) - ROS topics can take a moment to start publishing
    rosBridgeFrameTimeout = setTimeout(() => {
      if (!receivedFrame) {
        set({
          error:
            "No camera frames received. Check that the camera node is running and ROSBridge is connected.",
        });
      }
    }, 8000);

    if (!rosBridgeClient.isConnected()) {
      set({
        error:
          "ROSBridge is not connected yet. Waiting for camera topic...",
      });
    }

    if (fallbackReason) {
      setTimeout(() => {
        if (!receivedFrame) {
          set((state) => ({
            error:
              state.error ===
              "ROSBridge is not connected yet. Waiting for camera topic..."
                ? state.error
                : fallbackReason,
          }));
        }
      }, 50);
    }
  },

  stopRosBridgeStream: () => {
    clearRosBridgeSubscriptions();
    clearRosBridgeFrameWatchdog();
    set({
      isStreaming: false,
      frameData: null,
      error: null,
    });
  },

  fetchSettings: async () => {
    const result = await cameraApi.getCameraSettings();
    if (result.success && result.data) {
      set({ settings: result.data, error: null });
    } else {
      set({ error: result.error || "Failed to fetch camera settings" });
    }
  },

  updateSettings: async (partial: Partial<CameraSettings>) => {
    const current = get().settings;
    const merged = { ...current, ...partial } as CameraSettings;

    // Optimistic update
    set({ settings: merged });

    const result = await cameraApi.updateCameraSettings(partial);
    if (result.success && result.data) {
      set({ settings: result.data, error: null });
    } else {
      // Revert on failure
      set({ settings: current, error: result.error || "Failed to update camera settings" });
    }
  },
}));
