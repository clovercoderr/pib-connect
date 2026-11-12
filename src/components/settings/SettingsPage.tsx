import { useState, useEffect, useRef } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useRobotStore } from "../../stores/robotStore";
import { useBackendConnectionStore } from "../../stores/backendConnectionStore";
import { useAppStore } from "../../stores/appStore";
import { useAIStore } from "../../stores/aiStore";
import { healthApi, updateDevProxyUrl } from "../../lib/pibApi";
import { initRosBridge } from "../../lib/rosApi";
import {
  discoverPib,
  applyCandidate,
  type Candidate,
  type DiscoveryEvent,
} from "../../lib/smartConnect";
import {
  getTokenStatus,
  encryptToken,
  decryptToken,
  deleteToken,
  type TokenStatus,
} from "../../lib/aiTokenService";
import {
  JOINT_CONFIGS,
  getJointInvert,
  getJointHalfTurnOverride,
  setJointInvertOverride,
  setJointHalfTurnOverride,
  clearJointInvertOverrides,
  clearJointHalfTurnOverrides,
  clearJointVisualOffsetOverrides,
  countActiveJointOverrides,
  exportJointOverrideSnapshot,
  importJointOverrideSnapshot,
} from "../../lib/jointConfig";
import { Navbar } from "../ui/Navbar";

// Keep in sync with package.json / tauri.conf.json on release bumps.
const APP_VERSION = "0.2.0";

const GROUPS = [
  { id: "neck", label: "Neck" },
  { id: "right_arm", label: "Right Arm" },
  { id: "left_arm", label: "Left Arm" },
  { id: "right_hand", label: "Right Hand" },
  { id: "left_hand", label: "Left Hand" },
] as const;

type SettingsTab = "connection" | "ai" | "motor_controls" | "about";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");

  const [robotIp, setRobotIp] = useState(() => {
    return localStorage.getItem("pibRobotIp") || "192.168.1.100";
  });
  const [robotApiPort, setRobotApiPort] = useState(() => {
    return localStorage.getItem("pibRobotApiPort") || "5000";
  });
  const [rosBridgePort, setRosBridgePort] = useState(() => {
    return localStorage.getItem("pibRosBridgePort") || "9090";
  });

  const handleIpChange = (value: string) => {
    setRobotIp(value);
    localStorage.setItem("pibRobotIp", value);
    updateDevProxyUrl(value, robotApiPort);
    initRosBridge();
  };

  const handlePortChange = (value: string) => {
    setRobotApiPort(value);
    localStorage.setItem("pibRobotApiPort", value);
    updateDevProxyUrl(robotIp, value);
  };

  const handleRosBridgePortChange = (value: string) => {
    setRosBridgePort(value);
    localStorage.setItem("pibRosBridgePort", value);
    initRosBridge();
  };

  const handleResetRobotConnection = () => {
    setRobotIp("192.168.1.100");
    setRobotApiPort("5000");
    setRosBridgePort("9090");
    localStorage.setItem("pibRobotIp", "192.168.1.100");
    localStorage.setItem("pibRobotApiPort", "5000");
    localStorage.setItem("pibRosBridgePort", "9090");
    updateDevProxyUrl("192.168.1.100", "5000");
    initRosBridge();
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "connection", label: "Connection" },
    { id: "motor_controls", label: "Motor Controls" },
    { id: "ai", label: "AI" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="h-screen w-screen bg-[#111118] text-white flex flex-col overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between px-3 h-11 bg-[#111118] border-b border-white/[0.04] flex-shrink-0" data-tauri-drag-region>
        {/* Left: Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-[11px] font-medium text-white/50 tracking-wide uppercase pl-2">SETTINGS</h1>
        </div>

        {/* Center: Navigation pill */}
        <Navbar
          centered
          items={tabs.map(t => ({ id: t.id, label: t.label }))}
          activeId={activeTab}
          onChange={setActiveTab}
        />

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Empty spacer for balance */}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin border-t border-white/[0.04]">
        {activeTab === "connection" && (
          <ConnectionTab
            robotIp={robotIp}
            setRobotIp={handleIpChange}
            robotApiPort={robotApiPort}
            setRobotApiPort={handlePortChange}
            rosBridgePort={rosBridgePort}
            setRosBridgePort={handleRosBridgePortChange}
            onResetRobotConnection={handleResetRobotConnection}
          />
        )}
        {activeTab === "ai" && <AISettingsTab robotIp={robotIp} />}
        {activeTab === "motor_controls" && <MotorControlsTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

function ConnectionTab({
  robotIp,
  setRobotIp,
  robotApiPort,
  setRobotApiPort,
  rosBridgePort,
  setRosBridgePort,
  onResetRobotConnection,
}: {
  robotIp: string;
  setRobotIp: (v: string) => void;
  robotApiPort: string;
  setRobotApiPort: (v: string) => void;
  rosBridgePort: string;
  setRosBridgePort: (v: string) => void;
  onResetRobotConnection: () => void;
}) {
  const backendStatus = useBackendConnectionStore((state) => state.status);
  const backendError = useBackendConnectionStore((state) => state.error);
  const setBackendStatus = useBackendConnectionStore((state) => state.setStatus);
  const setBackendError = useBackendConnectionStore((state) => state.setError);

  const handleTestConnection = async () => {
    setBackendStatus("connecting");
    const result = await healthApi.checkHealth();
    if (result.success) {
      setBackendStatus("connected");
    } else {
      setBackendError(result.error || "Connection failed");
    }
  };

  const getStatusColor = () => {
    switch (backendStatus) {
      case "connected": return "bg-emerald-400";
      case "connecting": return "bg-yellow-400";
      case "error": return "bg-red-400";
      default: return "bg-white/15";
    }
  };

  const getStatusText = () => {
    switch (backendStatus) {
      case "connected": return "Connected";
      case "connecting": return "Testing...";
      case "error": return "Error";
      default: return "Not tested";
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">Robot API</h3>
          <button onClick={onResetRobotConnection} className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
            Reset to default
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="text-sm text-white/70">{getStatusText()}</span>
        </div>

        <SmartConnectPanel
          currentIp={robotIp}
          onPick={(candidate) => {
            setRobotIp(candidate.host);
            setRobotApiPort(String(candidate.apiPort));
            setRosBridgePort(String(candidate.rosBridgePort));
          }}
        />

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr,80px] gap-2">
            <div>
              <label className="block text-xs text-white/40 mb-1">IP Address</label>
              <input
                type="text"
                value={robotIp}
                onChange={(e) => setRobotIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-white/30 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1">Port</label>
              <input
                type="text"
                value={robotApiPort}
                onChange={(e) => setRobotApiPort(e.target.value)}
                placeholder="5000"
                className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-white/30 focus:outline-none transition-colors text-center"
              />
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <p className="text-[10px] text-white/40 font-mono">
              http://{robotIp || "192.168.1.100"}:{robotApiPort || "5000"}
            </p>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={backendStatus === "connecting"}
            className="w-full px-4 py-2 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {backendStatus === "connecting" ? "Testing..." : "Test Connection"}
          </button>

          {backendStatus === "error" && backendError && (
            <div className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2.5 border border-red-500/20">
              {backendError}
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">ROSBridge WebSocket</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/40 mb-1">ROSBridge Port</label>
            <input
              type="text"
              value={rosBridgePort}
              onChange={(e) => setRosBridgePort(e.target.value)}
              placeholder="9090"
              className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-white/30 focus:outline-none transition-colors"
            />
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <p className="text-[10px] text-white/40 font-mono">
              ws://{robotIp || "192.168.1.100"}:{rosBridgePort || "9090"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Smart Connect ─────────────────────────────────────────────────
// Modeled after Cerebra's connection UX (which is implicit because Cerebra
// is *served from* the pib). For a desktop client we have to find the robot
// ourselves, so we expose the same one-click feel via a parallel network
// probe — pib.local first, then saved IP, then a quick LAN sweep.
function SmartConnectPanel({
  currentIp,
  onPick,
}: {
  currentIp: string;
  onPick: (candidate: Candidate) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ checked: number; total: number; host: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight scan if the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const startScan = () => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    setCandidates([]);
    setProgress(null);
    setDone(false);
    setScanning(true);

    const handleEvent = (event: DiscoveryEvent) => {
      switch (event.type) {
        case "progress":
          setProgress({ checked: event.checked, total: event.total, host: event.host });
          break;
        case "found":
          setCandidates((prev) => {
            // De-dupe by host (in case the same robot answers on multiple paths).
            if (prev.some((c) => c.host === event.candidate.host)) return prev;
            return [...prev, event.candidate];
          });
          break;
        case "done":
          setDone(true);
          setScanning(false);
          break;
        default:
          break;
      }
    };

    void discoverPib({
      signal: ctl.signal,
      onEvent: handleEvent,
    }).catch(() => {
      setScanning(false);
      setDone(true);
    });
  };

  const stopScan = () => {
    abortRef.current?.abort();
    setScanning(false);
  };

  const ranked = [...candidates].sort((a, b) => {
    if (a.rosBridgeOk !== b.rosBridgeOk) return a.rosBridgeOk ? -1 : 1;
    return a.rttMs - b.rttMs;
  });

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-white/75">Smart Connect</span>
          <span className="text-[9px] text-white/30 uppercase tracking-wider">auto-discover</span>
        </div>
        {scanning ? (
          <button
            onClick={stopScan}
            className="px-2.5 py-1 text-[10px] rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/70 border border-white/10 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={startScan}
            className="px-2.5 py-1 text-[10px] rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
          >
            Scan network
          </button>
        )}
      </div>

      {scanning && progress && (
        <div className="mb-2">
          <div className="flex items-baseline justify-between text-[10px] text-white/40 mb-1">
            <span className="font-mono truncate max-w-[60%]" title={progress.host}>
              {progress.host}
            </span>
            <span className="tabular-nums">
              {progress.checked} / {progress.total}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-emerald-400/60 transition-[width] duration-200 ease-out"
              style={{ width: `${(progress.checked / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="space-y-1">
          {ranked.map((candidate) => {
            const isCurrent = candidate.host === currentIp;
            return (
              <button
                key={candidate.host}
                onClick={() => {
                  applyCandidate(candidate);
                  onPick(candidate);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-colors ${
                  isCurrent
                    ? "border-emerald-400/30 bg-emerald-400/[0.06] hover:bg-emerald-400/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-mono text-white/85 truncate">{candidate.host}</span>
                    {isCurrent && (
                      <span className="text-[9px] text-emerald-300/80 uppercase tracking-wider">current</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-white/35 tabular-nums">{Math.round(candidate.rttMs)} ms</span>
                    <span
                      className={`text-[9px] px-1 py-px rounded ${
                        candidate.rosBridgeOk
                          ? "bg-emerald-500/15 text-emerald-300/80"
                          : "bg-amber-500/15 text-amber-300/80"
                      }`}
                    >
                      {candidate.rosBridgeOk ? "ROS up" : "ROS down"}
                    </span>
                    <span className="text-[9px] text-white/30">
                      api :{candidate.apiPort} · ws :{candidate.rosBridgePort}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] text-white/30 group-hover:text-white/60">use →</span>
              </button>
            );
          })}
        </div>
      )}

      {!scanning && done && ranked.length === 0 && (
        <p className="text-[10px] text-white/40">
          No pib responded. Make sure it's on the same network and powered on, or set the IP manually below.
        </p>
      )}

      {!scanning && !done && ranked.length === 0 && (
        <p className="text-[10px] text-white/40">
          Tap <span className="text-white/60">Scan network</span> to find a pib on this LAN automatically.
          Tries <span className="font-mono text-white/60">pib.local</span> first, then your saved IP, then a fast subnet sweep.
        </p>
      )}
    </div>
  );
}

// ── AI Smart Connect ──────────────────────────────────────────────
// Cerebra-compatible token vault for the AI access token (Tryb / Gemini).
// First time:  user pastes token + picks a password → encrypt_token.
// Every session: user types the password → decrypt_token, activating the
// already-stored token so the voice_assistant can call the LLM.
// Without this step the backend has the encrypted bytes but no plaintext,
// and every chat request hits "successful: false" → silent timeout.
function AiSmartConnectPanel() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "setup" | "activate">("idle");
  const [tokenInput, setTokenInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // refresh is intentionally light: just probe status + clear errors.
  // The "auto-suggest activate when a token exists but is inactive" logic
  // only runs once on mount, otherwise the 4-second poll's stale-closure
  // would keep yanking the user out of the setup/activate forms.
  const refresh = async () => {
    try {
      setError(null);
      const s = await getTokenStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The settings window is a separate Tauri webview that doesn't run the
    // main app's startup code, so the ROSBridge client may be idle here.
    // Calling connect() is idempotent (it short-circuits when already
    // connected to the same URL), so we just call it on mount.
    initRosBridge();
    let cancelled = false;
    (async () => {
      try {
        const s = await getTokenStatus();
        if (cancelled) return;
        setStatus(s);
        // First-load auto-suggest: if there's already a stored-but-inactive
        // token, drop straight into the password prompt.
        if (s.exists && !s.active) setMode("activate");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Poll periodically so reconnects / backend restarts reflect quickly.
    const interval = setInterval(() => void refresh(), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear toasts.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2500);
    return () => clearTimeout(t);
  }, [success]);

  const handleEncrypt = async () => {
    setBusy(true);
    setError(null);
    const result = await encryptToken(tokenInput.trim(), passwordInput);
    setBusy(false);
    if (result.ok) {
      setSuccess("Token saved and activated.");
      setTokenInput("");
      setPasswordInput("");
      setMode("idle");
      await refresh();
    } else {
      setError(result.error);
    }
  };

  const handleDecrypt = async () => {
    setBusy(true);
    setError(null);
    const result = await decryptToken(passwordInput);
    setBusy(false);
    if (result.ok) {
      setSuccess("Token activated.");
      setPasswordInput("");
      setMode("idle");
      await refresh();
    } else {
      setError(result.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete the saved AI token from this robot? You'll have to re-enter it next time.")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteToken();
      setSuccess("Token deleted.");
      setMode("idle");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // ── Status pill ────────────────────────────────────────────────
  const statusPill = (() => {
    if (loading) return { color: "bg-white/15", text: "Checking…" };
    if (error || !status) return { color: "bg-red-400/70", text: "Voice-assistant offline" };
    if (status.active) return { color: "bg-emerald-400", text: "Token active — AI ready" };
    if (status.exists) return { color: "bg-amber-400", text: "Token stored — needs password" };
    return { color: "bg-white/25", text: "No token saved" };
  })();

  return (
    <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.03] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-white/85">AI Smart Connect</span>
          <span className="text-[9px] text-white/35 uppercase tracking-wider">token vault</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusPill.color}`} />
          <span className="text-[10px] text-white/55">{statusPill.text}</span>
        </div>
      </div>

      {/* Action buttons row, contextual to current state */}
      {mode === "idle" && (
        <div className="flex gap-1.5 mt-2">
          {status?.exists && !status?.active && (
            <button
              onClick={() => { setMode("activate"); setError(null); }}
              className="flex-1 px-2.5 py-1.5 text-[11px] rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-colors"
            >
              Activate with password
            </button>
          )}
          <button
            onClick={() => { setMode("setup"); setError(null); }}
            className="flex-1 px-2.5 py-1.5 text-[11px] rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/75 border border-white/10 transition-colors"
          >
            {status?.exists ? "Replace token" : "Set up token"}
          </button>
          {status?.exists && (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-white/[0.03] hover:bg-red-500/15 text-white/40 hover:text-red-300 border border-white/[0.08] hover:border-red-500/30 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Activate form: password only */}
      {mode === "activate" && (
        <div className="space-y-2 mt-2">
          <label className="block text-[10px] text-white/45 uppercase tracking-wider">Password</label>
          <input
            type="password"
            value={passwordInput}
            autoFocus
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) void handleDecrypt(); }}
            placeholder="Same one you used in Cerebra Smart Connect"
            className="w-full bg-white/5 text-white/90 text-xs rounded-md px-2.5 py-1.5 border border-white/10 focus:border-emerald-400/40 focus:outline-none transition-colors"
          />
          <div className="flex gap-1.5">
            <button
              onClick={() => { setMode("idle"); setError(null); setPasswordInput(""); }}
              disabled={busy}
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/55 border border-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDecrypt}
              disabled={busy || !passwordInput}
              className="flex-1 px-2.5 py-1.5 text-[11px] rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition-colors disabled:opacity-50"
            >
              {busy ? "Activating…" : "Activate token"}
            </button>
          </div>
        </div>
      )}

      {/* Setup form: token + password */}
      {mode === "setup" && (
        <div className="space-y-2 mt-2">
          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">AI access token</label>
            <input
              type="password"
              value={tokenInput}
              autoFocus
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your Tryb (or Gemini-via-Tryb) token"
              className="w-full bg-white/5 text-white/90 text-xs rounded-md px-2.5 py-1.5 border border-white/10 focus:border-emerald-400/40 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] text-white/45 uppercase tracking-wider mb-1">Password (≥ 8 chars)</label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) void handleEncrypt(); }}
              placeholder="You'll re-enter this each session to activate"
              className="w-full bg-white/5 text-white/90 text-xs rounded-md px-2.5 py-1.5 border border-white/10 focus:border-emerald-400/40 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setMode("idle"); setError(null); setTokenInput(""); setPasswordInput(""); }}
              disabled={busy}
              className="px-2.5 py-1.5 text-[11px] rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/55 border border-white/10 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleEncrypt}
              disabled={busy || !tokenInput || passwordInput.length < 8}
              className="flex-1 px-2.5 py-1.5 text-[11px] rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save & activate"}
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-2 text-[10px] text-emerald-300/80">
          ✓ {success}
        </div>
      )}
      {error && (
        <div className="mt-2 text-[10px] text-red-300/90 bg-red-500/10 rounded p-2 border border-red-500/20">
          {error}
        </div>
      )}
      {mode === "idle" && !status?.exists && !error && (
        <p className="mt-2 text-[10px] text-white/35 leading-relaxed">
          Your AI access token never leaves the robot. It's encrypted on disk with a password
          you choose, and you re-enter that password each time the robot reboots.
        </p>
      )}
    </div>
  );
}

function AISettingsTab({ robotIp }: { robotIp: string }) {
  const { modelEndpoint, setModelEndpoint, models, fetchModels } = useAIStore();
  const [mjpegPort, setMjpegPort] = useState(() => localStorage.getItem("pibMjpegPort") || "8080");

  // Smart Connect is the only supported provider for now: chat goes through
  // the robot's voice_assistant, which uses the token activated in the
  // AI Smart Connect panel above. If an older config left the endpoint on
  // TRYB or Custom, pin it back to pib-backend on mount.
  useEffect(() => {
    if (modelEndpoint.type !== "pib-backend") {
      setModelEndpoint({ type: "pib-backend" });
    }
  }, [modelEndpoint.type, setModelEndpoint]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleMjpegPortChange = (value: string) => {
    setMjpegPort(value);
    localStorage.setItem("pibMjpegPort", value);
  };

  return (
    <div className="space-y-5">
      {/* Smart Connect token vault — same flow Cerebra exposes under
          "Smart Connect": the AI access token lives encrypted on the
          robot, the user types a password each session to activate it. */}
      <AiSmartConnectPanel />

      <div>
        <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">AI Models</h3>
        <p className="text-[10px] text-white/35 leading-relaxed mb-2.5">
          Chat runs through Smart Connect — the robot's voice assistant using the
          token you activated above. These are the models it offers:
        </p>
        {models.length > 0 ? (
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 space-y-1">
            {models.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-xs text-white/60">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                <span>{m.visualName || m.apiName}</span>
                {m.hasImageSupport && <span className="text-[10px] text-blue-400/60 ml-auto">vision</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-white/30">
            No models found yet. They load once the robot connection is up — check
            Settings → Connection.
          </p>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Camera</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/40 mb-1">MJPEG Stream Port</label>
            <input
              type="text"
              value={mjpegPort}
              onChange={(e) => handleMjpegPortChange(e.target.value)}
              placeholder="8080"
              className="w-full bg-white/5 text-white/90 text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-white/30 focus:outline-none transition-colors"
            />
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <p className="text-[10px] text-white/40 font-mono">
              http://{robotIp || "192.168.1.100"}:{mjpegPort}/stream
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MotorControlsTab() {
  const calibrationModeEnabled = useAppStore((state) => state.calibrationModeEnabled);
  const setCalibrationModeEnabled = useAppStore((state) => state.setCalibrationModeEnabled);
  const jointPositions = useRobotStore((state) => state.jointPositions);
  const setAllPositionsLocal = useRobotStore((state) => state.setAllPositionsLocal);
  const error = useRobotStore((state) => state.error);
  const [overrideCount, setOverrideCount] = useState(() => countActiveJointOverrides());
  const [resetStatus, setResetStatus] = useState<"idle" | "done">("idle");
  const [ioStatus, setIoStatus] = useState<"idle" | "exported" | "imported" | "error">("idle");

  const refreshOverrideCount = () => setOverrideCount(countActiveJointOverrides());

  const flashIoStatus = (status: "exported" | "imported" | "error") => {
    setIoStatus(status);
    setTimeout(() => setIoStatus("idle"), 1800);
  };

  const handleExportCalibration = async () => {
    try {
      const snapshot = exportJointOverrideSnapshot();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filePath = await save({
        defaultPath: `pib-calibration-${stamp}.json`,
        filters: [{ name: "PIB Calibration", extensions: ["json"] }],
      });
      // User cancelled the save dialog — leave status untouched.
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(snapshot, null, 2));
      flashIoStatus("exported");
    } catch (e) {
      console.error("Failed to export calibration:", e);
      flashIoStatus("error");
    }
  };

  const handleImportCalibration = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "PIB Calibration", extensions: ["json"] }],
      });
      // User cancelled the open dialog.
      if (!selected || typeof selected !== "string") return;
      const text = await readTextFile(selected);
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("invalid");
      importJointOverrideSnapshot(parsed);
      refreshOverrideCount();
      setAllPositionsLocal({ ...jointPositions });
      flashIoStatus("imported");
    } catch (e) {
      console.error("Failed to import calibration:", e);
      flashIoStatus("error");
    }
  };

  const handleClearCalibration = () => {
    clearJointInvertOverrides();
    clearJointHalfTurnOverrides();
    clearJointVisualOffsetOverrides();
    refreshOverrideCount();
    // Re-render slider direction by touching local state.
    setAllPositionsLocal({ ...jointPositions });
    setResetStatus("done");
    setTimeout(() => setResetStatus("idle"), 1800);
  };

  return (
    <div className="space-y-4 anim-fade-in-up">
      <div className="rounded-lg p-3 border border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/75 font-medium">Calibration Mode</p>
            <p className="text-[10px] text-white/40 mt-0.5">
              Show calibration controls in Live Controls only when needed.
            </p>
          </div>
          <button
            onClick={() => setCalibrationModeEnabled(!calibrationModeEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              calibrationModeEnabled ? "bg-emerald-500" : "bg-white/20"
            }`}
            title={calibrationModeEnabled ? "Calibration mode enabled" : "Calibration mode disabled"}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                calibrationModeEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Calibration overrides summary + import / export / reset */}
      <div className="rounded-lg p-3 border border-white/10 bg-white/5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/75 font-medium">Joint Calibration Overrides</p>
            <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">
              {overrideCount > 0
                ? `${overrideCount} joint${overrideCount === 1 ? "" : "s"} have INV / 180° / visual offset overrides applied.`
                : "No calibration overrides applied — joints use defaults."}
            </p>
          </div>
          {overrideCount > 0 && (
            <span className="anim-scale-in inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold tabular-nums">
              {overrideCount}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            onClick={handleExportCalibration}
            className={`px-3 py-2 text-[11px] rounded-md border transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
              ioStatus === "exported"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.1] text-white/75"
            }`}
            title="Save your INV / 180° / visual offset settings to a JSON file"
          >
            {ioStatus === "exported" ? "Exported ✓" : "Export calibration"}
          </button>
          <button
            onClick={handleImportCalibration}
            className={`px-3 py-2 text-[11px] rounded-md border transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
              ioStatus === "imported"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : ioStatus === "error"
                  ? "bg-red-500/15 text-red-300 border-red-500/30"
                  : "bg-white/[0.06] hover:bg-white/[0.1] border-white/[0.1] text-white/75"
            }`}
            title="Load INV / 180° / visual offset settings from a JSON file"
          >
            {ioStatus === "imported" ? "Imported ✓" : ioStatus === "error" ? "Invalid file" : "Import calibration"}
          </button>
        </div>

        <button
          onClick={handleClearCalibration}
          disabled={overrideCount === 0 && resetStatus === "idle"}
          className={`mt-1.5 w-full px-3 py-2 text-[11px] rounded-md border transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
            resetStatus === "done"
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              : overrideCount > 0
                ? "bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-white/65"
                : "bg-white/[0.03] border-white/[0.06] text-white/35 cursor-not-allowed"
          }`}
        >
          {resetStatus === "done" ? "Calibration cleared" : "Clear all calibration overrides"}
        </button>
      </div>

      {/* Pairing mode lives in the main window's Controls tab now —
          no need to duplicate the toggle here. Errors are still surfaced. */}
      {error && (
        <div className="rounded-lg px-3 py-2 border border-red-500/20 bg-red-500/10 text-[10px] text-red-300/90">
          {error}
        </div>
      )}

      {GROUPS.map((group) => {
        const joints = JOINT_CONFIGS.filter((j) => j.group === group.id);
        if (joints.length === 0) return null;

        return (
          <div key={group.id}>
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
              {group.label}
            </h3>
            <div className="space-y-1">
              {joints.map((joint) => {
                const position = jointPositions[joint.id] ?? joint.defaultCentidegrees;

                return (
                  <div
                    key={joint.id}
                    className="p-2 bg-white/5 rounded hover:bg-white/[0.07] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-[9px] text-white/35 font-mono max-w-[10rem] truncate"
                          title={joint.motorName}
                        >
                          {joint.motorName}
                        </span>
                        <span className="text-xs text-white/70">{joint.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const nextHalfTurn = !getJointHalfTurnOverride(joint.id);
                            setJointHalfTurnOverride(joint.id, nextHalfTurn);
                            setAllPositionsLocal({ ...jointPositions });
                            refreshOverrideCount();
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            getJointHalfTurnOverride(joint.id)
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-white/5 text-white/40 border-white/10 hover:text-white/60"
                          }`}
                          title="Rotate 3D axis by 180°"
                        >
                          180
                        </button>
                        <button
                          onClick={() => {
                            const nextInvert = !getJointInvert(joint.id);
                            setJointInvertOverride(joint.id, nextInvert);
                            setAllPositionsLocal({ ...jointPositions });
                            refreshOverrideCount();
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            getJointInvert(joint.id)
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                              : "bg-white/5 text-white/40 border-white/10 hover:text-white/60"
                          }`}
                          title="Invert 3D direction"
                        >
                          INV
                        </button>
                        <span className="text-xs font-mono text-white/50 tabular-nums w-16 text-right">
                          {(position / 100).toFixed(1)}°
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AboutTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <h2 className="text-lg font-semibold text-white/90 tracking-tight">PIB Connect</h2>
      <p className="text-xs text-white/40 font-mono tabular-nums">v{APP_VERSION}</p>
      <a
        href="https://pibconnect.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-400/80 hover:text-blue-300 underline underline-offset-2 transition-colors"
      >
        pibconnect.com
      </a>
      <p className="mt-5 pt-4 border-t border-white/[0.07] text-[11px] text-white/35 w-44">
        by Linus Kleesiek
      </p>
    </div>
  );
}

