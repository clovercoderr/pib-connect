// ROSBridge WebSocket client for pib-backend motor control and topic pub/sub.
//
// pib-backend exposes motor position control exclusively through the
// ROS service "apply_joint_trajectory" over a ROSBridge WebSocket (port 9090).
// There is no REST endpoint for live position updates.
//
// This client also supports subscribing to and publishing on ROS topics
// using the standard ROSBridge topic protocol.

export const ROS_TOPICS = {
  JOINT_TRAJECTORY: '/joint_trajectory',
  DISPLAY_COMMAND: '/display/command',
  AUDIO_PLAY: '/audio/play',
  AUDIO_STOP: '/audio/stop',
  VIDEO_PLAY: '/video/play',
  VIDEO_STOP: '/video/stop',
  CAMERA_IMAGE_COMPRESSED: '/camera/image/compressed',
  CAMERA_IMAGE_RAW: '/camera/image_raw',
  CAMERA_TOPIC: '/camera_topic',
  CAMERA_TOPIC_LEGACY: 'camera_topic',
  MICROPHONE_AUDIO: '/audio/input',
  STT_TEXT: '/voice_assistant/stt_text',
  TTS_TEXT: '/voice_assistant/tts_text',
  CHAT_IS_LISTENING: '/chat_is_listening',
  VOICE_ASSISTANT_STATE: '/voice_assistant_state',
  CHAT_MESSAGES: '/chat_messages',
  /** Wipe the stored Tryb / AI access token. std_msgs/Empty publish. */
  DELETE_TOKEN: '/delete_token',
} as const;

export const ROS_SERVICES = {
  SET_VOICE_ASSISTANT_STATE: '/set_voice_assistant_state',
  GET_VOICE_ASSISTANT_STATE: '/get_voice_assistant_state',
  SEND_CHAT_MESSAGE: '/send_chat_message',
  GET_CHAT_IS_LISTENING: '/get_chat_is_listening',
  /** AI Smart Connect — Cerebra-compatible token vault on the voice_assistant. */
  ENCRYPT_TOKEN: '/encrypt_token',
  DECRYPT_TOKEN: '/decrypt_token',
  GET_TOKEN_EXISTS: '/get_token_exists',
} as const;

function getRosBridgeUrl(): string {
  const ip = localStorage.getItem("pibRobotIp") || window.location.hostname;
  const port = localStorage.getItem("pibRosBridgePort") || "9090";
  return `ws://${ip}:${port}`;
}

interface JointTrajectoryArgs {
  joint_names: string[];
  // One point per motor; positions[0] is the centidegree value for that motor.
  points: Array<{
    positions: [number];
    time_from_start: { sec: 0; nanosec: 0 };
  }>;
  header: { stamp: { sec: 0; nanosec: 0 }; frame_id: "" };
}

interface Subscription {
  id: string;
  topic: string;
  msgType: string;
  callback: (msg: unknown) => void;
}

interface ServiceCallback {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class RosBridgeClient {
  private ws: WebSocket | null = null;
  private url = "";
  private callId = 0;
  private subId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions = new Map<string, Subscription>();
  private advertisedTopics = new Set<string>();
  private serviceCallbacks = new Map<string, ServiceCallback>();

  connect(url: string) {
    if (
      this.url === url &&
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.url = url;
    this._cleanup();

    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        console.log(`[ROSBridge] Connected to ${url}`);
        this._resubscribeAll();
      };
      this.ws.onclose = () => {
        console.log("[ROSBridge] Disconnected — retrying in 3 s");
        this.advertisedTopics.clear();
        this._scheduleReconnect();
      };
      this.ws.onerror = () => {
        // error fires before close; the close handler handles reconnect
      };
      this.ws.onmessage = (event) => this._handleMessage(event);
    } catch {
      this._scheduleReconnect();
    }
  }

  private _cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.advertisedTopics.clear();
  }

  private _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.url) this.connect(this.url);
    }, 3000);
  }

  private _handleMessage(event: MessageEvent) {
    let data: { op?: string; topic?: string; msg?: unknown; id?: string; result?: unknown; values?: unknown; success?: boolean };
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.op === "publish" && data.topic) {
      for (const sub of this.subscriptions.values()) {
        if (sub.topic === data.topic) {
          try {
            sub.callback(data.msg);
          } catch (err) {
            console.warn(`[ROSBridge] subscription callback error (${sub.topic}):`, err);
          }
        }
      }
    }

    // Handle service_response
    if (data.op === "service_response" && data.id) {
      const cb = this.serviceCallbacks.get(data.id);
      if (cb) {
        this.serviceCallbacks.delete(data.id);
        clearTimeout(cb.timer);
        if (data.success === false) {
          cb.reject(new Error("ROS service call failed"));
        } else {
          cb.resolve(data.values ?? data.result ?? data);
        }
      }
    }
  }

  /** Re-subscribe all active subscriptions after a reconnect. */
  private _resubscribeAll() {
    for (const sub of this.subscriptions.values()) {
      this._sendSubscribe(sub);
    }
  }

  private _sendSubscribe(sub: Subscription) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg = {
      op: "subscribe",
      id: sub.id,
      topic: sub.topic,
      type: sub.msgType,
    };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[ROSBridge] subscribe send failed:", err);
    }
  }

  /** Subscribe to a ROS topic. Returns a subscription ID for later unsubscribe. */
  subscribe(topic: string, msgType: string, callback: (msg: unknown) => void): string {
    const id = `sub_${topic}:${++this.subId}`;
    const sub: Subscription = { id, topic, msgType, callback };
    this.subscriptions.set(id, sub);
    this._sendSubscribe(sub);
    return id;
  }

  /** Unsubscribe from a previously subscribed topic. */
  unsubscribe(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;

    this.subscriptions.delete(subscriptionId);

    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg = {
      op: "unsubscribe",
      id: sub.id,
      topic: sub.topic,
    };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[ROSBridge] unsubscribe send failed:", err);
    }
  }

  /** Publish a message to a ROS topic. Advertises the topic automatically on first use. */
  publish(topic: string, msgType: string, data: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    // Advertise the topic if we haven't already in this connection session.
    if (!this.advertisedTopics.has(topic)) {
      const advertiseMsg = {
        op: "advertise",
        topic,
        type: msgType,
      };
      try {
        this.ws.send(JSON.stringify(advertiseMsg));
        this.advertisedTopics.add(topic);
      } catch (err) {
        console.warn("[ROSBridge] advertise send failed:", err);
        return;
      }
    }

    const msg = {
      op: "publish",
      topic,
      msg: data,
    };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[ROSBridge] publish send failed:", err);
    }
  }

  /** Call a ROS service and return the result. Timeout defaults to 15s. */
  callService(service: string, serviceType: string, args: unknown = {}, timeoutMs = 15000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("ROSBridge not connected"));
        return;
      }

      const id = `call_${service}:${++this.callId}`;
      const timer = setTimeout(() => {
        this.serviceCallbacks.delete(id);
        reject(new Error(`ROS service call ${service} timed out`));
      }, timeoutMs);

      this.serviceCallbacks.set(id, { resolve, reject, timer });

      const msg = {
        op: "call_service",
        id,
        service,
        type: serviceType,
        args,
      };

      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        this.serviceCallbacks.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("Failed to send service call"));
      }
    });
  }

  /** Send one or more motor positions in a single applyJointTrajectory call. */
  applyJointTrajectory(motors: Array<{ motorName: string; centidegrees: number }>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const args: JointTrajectoryArgs = {
      header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" },
      joint_names: motors.map((m) => m.motorName),
      points: motors.map((m) => ({
        positions: [m.centidegrees],
        time_from_start: { sec: 0, nanosec: 0 },
      })),
    };

    const msg = {
      op: "call_service",
      id: `call_/apply_joint_trajectory:${++this.callId}`,
      service: "/apply_joint_trajectory",
      args: { joint_trajectory: args },
    };

    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[ROSBridge] send failed:", err);
    }
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this._cleanup();
    this.subscriptions.clear();
  }
}

export const rosBridgeClient = new RosBridgeClient();

/** Call once on app startup (and after IP/port settings changes). */
export function initRosBridge() {
  rosBridgeClient.connect(getRosBridgeUrl());
}

/** Stop ROSBridge reconnect attempts and close the active socket. */
export function disconnectRosBridge() {
  rosBridgeClient.disconnect();
}
