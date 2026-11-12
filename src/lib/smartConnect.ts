// Smart Connect — auto-discovery of a pib robot on the local network.
//
// Cerebra (the official Angular UI) doesn't have to do this: it's served *from*
// the pib, so it just uses `window.location.hostname`. A desktop client doesn't
// have that luxury, so we probe the network ourselves.
//
// Strategy, in priority order:
//   1. The hostname `pib.local` (mDNS — works on most home networks).
//   2. The short hostname `pib` (Windows / NetBIOS / some routers).
//   3. The user's last-known saved IP (instant if still valid).
//   4. A parallel sweep of the inferred /24 subnet, hitting a small set of
//      "likely robot" host octets first (fast wins on typical home LANs).
//
// We probe the Flask REST endpoint (/motor on :5000) — if a host returns a
// 200, we know it's a pib-backend instance, not just any random open port.
// rttMs is captured so the UI can present the fastest match first.

const DEFAULT_API_PORT = 5000;
const DEFAULT_ROS_PORT = 9090;
const PROBE_TIMEOUT_MS = 1200;
const ROSBRIDGE_PROBE_TIMEOUT_MS = 1500;
// Hosts we hit before any LAN sweep. Order matters — first hit wins for the
// status indicator. Localhost is included so the bundled test-backend
// (./test-backend/start.sh) gets discovered automatically without manual IP
// entry. If you don't have docker running, the loopback probe just fails
// fast (~1ms) and the scan moves on.
const PRIMARY_HOSTNAMES = ["pib.local", "pib", "localhost", "127.0.0.1"] as const;

// macOS's AirPlay Receiver squats on :5000, so the test-backend script
// auto-remaps to :5001+. We try those alternates *only* when probing
// loopback hosts — saves a sweep over the whole LAN at non-default ports.
const LOOPBACK_HOSTS = new Set<string>(["localhost", "127.0.0.1"]);
const LOOPBACK_API_FALLBACK_PORTS = [5001, 5002, 5003] as const;
const LOOPBACK_ROS_FALLBACK_PORTS = [9091, 9092, 9093] as const;

export interface Candidate {
  /** Resolvable host: hostname or dotted-quad IP. */
  host: string;
  apiPort: number;
  rosBridgePort: number;
  /** Whether `GET http://host:apiPort/motor` returned 200. */
  apiOk: boolean;
  /** Whether `ws://host:rosBridgePort` opened successfully. */
  rosBridgeOk: boolean;
  /** Round-trip time of the API probe in ms (for ranking). */
  rttMs: number;
}

export type DiscoveryEvent =
  | { type: "start"; totalCandidates: number }
  | { type: "progress"; checked: number; total: number; host: string }
  | { type: "found"; candidate: Candidate }
  | { type: "done"; results: Candidate[]; aborted: boolean }
  | { type: "error"; message: string };

export interface DiscoveryOptions {
  signal?: AbortSignal;
  apiPort?: number;
  rosBridgePort?: number;
  /** Hint subnet to scan, e.g. "192.168.1". If omitted we infer from the
   *  saved IP, falling back to the most common consumer ranges. */
  subnetHint?: string;
  /** Stop probing once this many working pibs have been found. */
  maxResults?: number;
  /** Skip the LAN sweep — only try mDNS hostnames + saved IP. Faster, but
   *  finds nothing if mDNS is broken on the user's network. */
  skipLanScan?: boolean;
  onEvent?: (event: DiscoveryEvent) => void;
}

/**
 * Probe one host's REST API with a short timeout. Returns rttMs on success.
 * A non-200 reply still counts as "the port is alive" but we filter to 200
 * because we want to confirm it's a pib-backend, not just any HTTP server.
 */
async function probeApi(
  host: string,
  port: number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; rttMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  // Forward outer abort to inner controller so we can cancel mid-flight.
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const start = performance.now();
  try {
    const res = await fetch(`http://${host}:${port}/motor`, {
      method: "GET",
      signal: controller.signal,
      // pib-backend doesn't set CORS headers in some configs; opaque responses
      // (no-cors) won't tell us if it was a 200, so we use cors and just
      // catch the error if it fails — a real pib answers cleanly.
      cache: "no-store",
    });
    return { ok: res.ok, rttMs: performance.now() - start };
  } catch {
    return { ok: false, rttMs: performance.now() - start };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Best-effort ROSBridge probe — open a websocket, see if it accepts the
 * connection within a short window. Distinguishes "pib running but ROS
 * not up yet" from "fully ready".
 */
function probeRosBridge(host: string, port: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timer = setTimeout(() => finish(false), ROSBRIDGE_PROBE_TIMEOUT_MS);
    const onAbort = () => finish(false);
    signal?.addEventListener("abort", onAbort, { once: true });

    ws.onopen = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(true);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      finish(false);
    };
  });
}

/** Infer a /24 subnet prefix (e.g. "192.168.1") from a dotted-quad string,
 *  or null if the input doesn't look like an IPv4 address. */
function subnetOf(ip: string): string | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** Build the list of host octets to try, ordered by "most likely first".
 *  pibs are usually statically configured or DHCP'd to a low number. */
function lanCandidateOctets(): number[] {
  const order: number[] = [];
  // Common static-ish: .100, .101, .42 (the answer)
  for (const seed of [100, 101, 42, 10, 20, 50]) order.push(seed);
  // Then sweep the rest of the low range — this is where DHCP usually lands.
  for (let i = 2; i <= 80; i++) {
    if (!order.includes(i)) order.push(i);
  }
  return order;
}

/** All subnets we'll consider when no hint is provided. */
const FALLBACK_SUBNETS = ["192.168.1", "192.168.0", "10.0.0", "10.0.1"] as const;

/** Read the user's previously-saved IP (Settings → Connection). */
function readSavedIp(): string | null {
  try {
    return localStorage.getItem("pibRobotIp");
  } catch {
    return null;
  }
}

/** Build the full list of hosts to try, in order. Hostnames first, saved IP
 *  next, then a sweep of the inferred / fallback subnets. */
function buildCandidateHosts(opts: DiscoveryOptions): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  const add = (host: string) => {
    if (!host || seen.has(host)) return;
    seen.add(host);
    hosts.push(host);
  };

  // 1. mDNS / NetBIOS short hostnames.
  for (const name of PRIMARY_HOSTNAMES) add(name);

  // 2. Saved IP — odds-on it still works.
  const saved = readSavedIp();
  if (saved) add(saved);

  if (opts.skipLanScan) return hosts;

  // 3. Subnet sweep. Hint > saved-IP-derived > fallback list.
  const subnets: string[] = [];
  if (opts.subnetHint) subnets.push(opts.subnetHint);
  if (saved) {
    const s = subnetOf(saved);
    if (s) subnets.push(s);
  }
  for (const s of FALLBACK_SUBNETS) subnets.push(s);

  // Dedupe subnets while preserving order.
  const subnetSeen = new Set<string>();
  for (const s of subnets) {
    if (subnetSeen.has(s)) continue;
    subnetSeen.add(s);
    for (const octet of lanCandidateOctets()) add(`${s}.${octet}`);
  }

  return hosts;
}

/**
 * Discover pib robots on the network. Streams progress through `onEvent` and
 * returns the final ranked result list.
 *
 * Designed for an interactive UI: probes run in parallel batches so the UI
 * can show "found one" almost immediately while the slower hosts time out
 * in the background.
 */
export async function discoverPib(opts: DiscoveryOptions = {}): Promise<Candidate[]> {
  const apiPort = opts.apiPort ?? DEFAULT_API_PORT;
  const rosBridgePort = opts.rosBridgePort ?? DEFAULT_ROS_PORT;
  const maxResults = opts.maxResults ?? 5;
  const emit = opts.onEvent ?? (() => {});

  const hosts = buildCandidateHosts(opts);
  emit({ type: "start", totalCandidates: hosts.length });

  const results: Candidate[] = [];
  let checked = 0;
  let aborted = false;

  // Parallelism cap. Browsers (and Tauri's webview) limit concurrent fetches;
  // 12 is a good "fast but not throttled" number. mDNS hostnames go in
  // batch 1 by themselves so they're not held up by slow IP probes.
  const BATCH_SIZE = 12;

  // First pass: hostnames only (PRIMARY_HOSTNAMES + saved IP).
  // The rest are LAN sweep — process them with a higher concurrency.
  const fastQueueLen = Math.min(hosts.length, PRIMARY_HOSTNAMES.length + 1);
  const fastQueue = hosts.slice(0, fastQueueLen);
  const sweepQueue = hosts.slice(fastQueueLen);

  /** Try one (host, apiPort, rosBridgePort) tuple; record a candidate on hit. */
  const probeTuple = async (host: string, ap: number, rp: number) => {
    if (opts.signal?.aborted) return false;
    const api = await probeApi(host, ap, opts.signal);
    if (!api.ok) return false;
    const rosOk = await probeRosBridge(host, rp, opts.signal).catch(() => false);
    const candidate: Candidate = {
      host,
      apiPort: ap,
      rosBridgePort: rp,
      apiOk: true,
      rosBridgeOk: rosOk,
      rttMs: api.rttMs,
    };
    results.push(candidate);
    emit({ type: "found", candidate });
    return true;
  };

  const probeOne = async (host: string) => {
    if (opts.signal?.aborted) {
      aborted = true;
      return;
    }
    emit({ type: "progress", checked, total: hosts.length, host });

    if (LOOPBACK_HOSTS.has(host)) {
      // Loopback (local test-backend): the API and ROSBridge ports are
      // remapped INDEPENDENTLY when their defaults are taken — on macOS,
      // AirPlay holds :5000 so flask moves to :5001, but ROSBridge usually
      // stays on :9090. Probing them as fixed pairs (5001↔9091) guessed the
      // wrong ROS port. Instead, scan each port range on its own and pair
      // the first hit of each.
      const apiCandidates = [apiPort, ...LOOPBACK_API_FALLBACK_PORTS];
      const rosCandidates = [rosBridgePort, ...LOOPBACK_ROS_FALLBACK_PORTS];

      let foundApi: { port: number; rttMs: number } | null = null;
      for (const ap of apiCandidates) {
        if (opts.signal?.aborted) break;
        const api = await probeApi(host, ap, opts.signal);
        if (api.ok) {
          foundApi = { port: ap, rttMs: api.rttMs };
          break;
        }
      }
      if (!foundApi) {
        checked += 1;
        return;
      }

      let foundRos: number | null = null;
      for (const rp of rosCandidates) {
        if (opts.signal?.aborted) break;
        const ok = await probeRosBridge(host, rp, opts.signal).catch(() => false);
        if (ok) {
          foundRos = rp;
          break;
        }
      }

      const candidate: Candidate = {
        host,
        apiPort: foundApi.port,
        rosBridgePort: foundRos ?? rosBridgePort,
        apiOk: true,
        rosBridgeOk: foundRos !== null,
        rttMs: foundApi.rttMs,
      };
      results.push(candidate);
      emit({ type: "found", candidate });
      checked += 1;
      return;
    }

    // Non-loopback host (a real pib on the LAN): API and ROSBridge are on
    // their standard ports, so a single tuple probe is enough.
    await probeTuple(host, apiPort, rosBridgePort);
    checked += 1;
  };

  // Run fast queue in parallel so total wall time ≈ one probe timeout
  // regardless of how many hostnames we try. Saved-IP and mDNS hosts that
  // don't resolve fail in the millisecond range; only fully unreachable
  // ones cost the full 1.2s.
  if (fastQueue.length > 0 && !opts.signal?.aborted) {
    await Promise.all(fastQueue.map(probeOne));
  }

  // Run sweep in parallel batches.
  for (let i = 0; i < sweepQueue.length && results.length < maxResults; i += BATCH_SIZE) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    const slice = sweepQueue.slice(i, i + BATCH_SIZE);
    await Promise.all(slice.map(probeOne));
  }

  // Rank: ROS-up first, then by RTT.
  results.sort((a, b) => {
    if (a.rosBridgeOk !== b.rosBridgeOk) return a.rosBridgeOk ? -1 : 1;
    return a.rttMs - b.rttMs;
  });

  emit({ type: "done", results, aborted });
  return results;
}

/** Convenience: persist a chosen candidate so the rest of the app picks it
 *  up via the existing `pibRobotIp` / `pibRosBridgePort` localStorage keys. */
export function applyCandidate(candidate: Candidate): void {
  try {
    localStorage.setItem("pibRobotIp", candidate.host);
    localStorage.setItem("pibRobotApiPort", String(candidate.apiPort));
    localStorage.setItem("pibRosBridgePort", String(candidate.rosBridgePort));
  } catch {
    // private browsing / sandboxed — caller will surface failure via the UI.
  }
}
