// AI Smart Connect — token vault on the pib's voice_assistant node.
//
// This is the same flow Cerebra calls "Smart Connect": the user's AI access
// token (Tryb/Gemini) lives encrypted on the robot, never in the frontend.
// On every backend boot the token starts as *exists but not active*; the
// user has to type the password each session to activate it.
//
// The four primitives, each backed by a ROS service on the voice_assistant:
//   • status   →   get_token_exists  → { token_exists, token_active }
//   • set      →   encrypt_token     ← { token, password }
//   • activate →   decrypt_token     ← { password }
//   • delete   →   /delete_token     ← std_msgs/Empty publish
//
// All but `delete` are request/response services with a `successful: bool`.
// `decrypt_token` returning false almost always means "wrong password".

import { rosBridgeClient, ROS_SERVICES, ROS_TOPICS } from "./rosApi";

export interface TokenStatus {
  exists: boolean;
  active: boolean;
}

const SERVICE_TIMEOUT_MS = 8000;

/** Read whether the robot has a token stored and whether it's currently active. */
export async function getTokenStatus(): Promise<TokenStatus> {
  const result = (await rosBridgeClient.callService(
    ROS_SERVICES.GET_TOKEN_EXISTS,
    "datatypes/srv/GetTokenExists",
    {},
    SERVICE_TIMEOUT_MS,
  )) as { token_exists?: boolean; token_active?: boolean } | undefined;

  return {
    exists: Boolean(result?.token_exists),
    active: Boolean(result?.token_active),
  };
}

/**
 * Encrypt a fresh token with the user's password. The backend rejects
 * passwords shorter than 8 characters with `successful: false`.
 */
export async function encryptToken(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!token.trim()) {
    return { ok: false, error: "Token cannot be empty." };
  }

  try {
    const result = (await rosBridgeClient.callService(
      ROS_SERVICES.ENCRYPT_TOKEN,
      "datatypes/srv/EncryptToken",
      { token, password },
      SERVICE_TIMEOUT_MS,
    )) as { successful?: boolean } | undefined;

    if (result?.successful) return { ok: true };
    return { ok: false, error: "Backend rejected the token. Check the password is at least 8 characters." };
  } catch (err) {
    return { ok: false, error: friendlyServiceError(err, "encrypt_token") };
  }
}

/**
 * Activate the stored token for this session. Returns `ok: false` with a
 * "wrong password" message on the most common failure mode — anything more
 * specific has to come from the user's environment.
 */
export async function decryptToken(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password) {
    return { ok: false, error: "Enter the password you used when first saving the token." };
  }

  try {
    const result = (await rosBridgeClient.callService(
      ROS_SERVICES.DECRYPT_TOKEN,
      "datatypes/srv/DecryptToken",
      { password },
      SERVICE_TIMEOUT_MS,
    )) as { successful?: boolean } | undefined;

    if (result?.successful) return { ok: true };
    return { ok: false, error: "Wrong password (or stored token is corrupt). Try again." };
  } catch (err) {
    return { ok: false, error: friendlyServiceError(err, "decrypt_token") };
  }
}

/**
 * Wipe the stored token. delete_token is a topic on the backend (not a
 * service), so we publish an Empty message and re-query status afterwards.
 */
export async function deleteToken(): Promise<void> {
  rosBridgeClient.publish(ROS_TOPICS.DELETE_TOKEN, "std_msgs/Empty", {});
  // Give the backend a moment to delete the files; callers should re-fetch
  // status after this resolves. Small delay so the next get_token_exists
  // sees the wiped state.
  await new Promise((r) => setTimeout(r, 250));
}

function friendlyServiceError(err: unknown, service: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("not connected")) {
    return "Not connected to the robot. Open Settings → Connection and run Smart Connect.";
  }
  if (msg.includes("timed out")) {
    return `${service} didn't respond — make sure the voice_assistant container is running (test-backend: ./start.sh --ai).`;
  }
  return `${service} failed: ${msg}`;
}
