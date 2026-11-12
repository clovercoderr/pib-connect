import { invoke } from "@tauri-apps/api/core";

export interface PortInfo {
  name: string;
  port_type: string;
}

export async function listSerialPorts(): Promise<PortInfo[]> {
  return invoke<PortInfo[]>("list_serial_ports");
}

export async function connectSerial(
  portName: string,
  baudRate: number,
): Promise<void> {
  return invoke("connect_serial", { portName, baudRate });
}

export async function connectMock(): Promise<void> {
  return invoke("connect_mock");
}

export async function disconnectSerial(): Promise<void> {
  return invoke("disconnect_serial");
}

export async function getConnectionStatus(): Promise<boolean> {
  return invoke<boolean>("get_connection_status");
}

export async function sendMotorPosition(
  motorId: number,
  position: number,
): Promise<void> {
  return invoke("send_motor_position", { motorId, position });
}

export async function sendAllPositions(
  positions: [number, number][],
): Promise<void> {
  return invoke("send_all_positions", { positions });
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type MediaWebType = "image" | "video" | "audio" | "none";

export interface MediaWebContent {
  mediaType: MediaWebType;
  source: string;
  title: string;
  updatedAtMs: number;
}

export interface MediaWebStatus {
  running: boolean;
  port: number;
  hostIp: string;
  url: string;
  content: MediaWebContent;
}

export async function startMediaWebServer(port = 1592): Promise<MediaWebStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Media web server is only available in the Tauri app runtime.");
  }
  return invoke<MediaWebStatus>("start_media_web_server", { port });
}

export async function stopMediaWebServer(): Promise<MediaWebStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Media web server is only available in the Tauri app runtime.");
  }
  return invoke<MediaWebStatus>("stop_media_web_server");
}

export async function getMediaWebStatus(): Promise<MediaWebStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Media web server is only available in the Tauri app runtime.");
  }
  return invoke<MediaWebStatus>("get_media_web_status");
}

export async function setMediaWebContent(
  mediaType: MediaWebType,
  source: string,
  title?: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("set_media_web_content", {
    mediaType,
    source,
    title,
  });
}
