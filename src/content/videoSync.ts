/**
 * API esterna:
 * setupVideoSync()
 * setSyncEnabled(enabled: boolean)
 * onSyncUiUpdate(cb: (state: UiState) => void)
 * 
 * Si appoggia a:
 *    - webrtc.ts per l'invio/ricezione dei messaggi di sync (sendSync / onSyncMessage)
 *    - uno script di pagina che espone:
 *        → window.postMessage({ source: "movie-time-content", type: "HELLO_REQUEST" }, "*")
 *        ← { source: "movie-time-bridge", type: "HELLO_RESPONSE", info: { duration: number, ... } }
 *        ← { source: "movie-time-bridge", type: "TICK", time: number, paused: boolean }
 *        → window.postMessage({ source: "movie-time-content", type: "PLAY" | "PAUSE" | "SEEK" | "SET_RATE" | "CLEAR_RATE", ... }, "*")
*/


import { sendSync, onSyncMessage } from "./webrtc";
import { syncConfig } from "./syncConfig";




// Ruolo logico nel protocollo
type SyncRole = "leader" | "follower" | "none";

// Stato del protocollo lato client
type SyncPhase = "disabled" | "activating" | "synced" | "degraded";

export interface UiState {
  enabled: boolean;               // toggle locale del sync
  phase: SyncPhase;               // fase del protocollo
  role: SyncRole;                 // leader / follower / none
  compatible: "unknown" | "yes" | "no";
  lastDriftSeconds?: number;      // differenza leader/follower nell'ultimo AUTO/MANUAL
}



// Messaggi scambiati sul canale di sync (via WebRTC)
interface ActivateMessage {
  type: "ACTIVATE";
  activationTimestamp: number;
  duration: number;
  peerId: string;
}

interface DeactivateMessage {
  type: "DEACTIVATE";
}

interface FullStateMessage {
  type: "FULL_STATE";
  time: number;
  paused: boolean;
  duration: number;
  playbackRate: number;
  sentAt: number;
}

interface AutoStateMessage {
  type: "AUTO_STATE";
  time: number;
  paused: boolean;
  sentAt: number;
}

interface ManualStateMessage {
  type: "MANUAL_STATE";
  time: number;
  paused: boolean;
  sentAt: number;
}

type SyncWireMessage =
  | ActivateMessage
  | DeactivateMessage
  | FullStateMessage
  | AutoStateMessage
  | ManualStateMessage;

// Informazioni di attivazione locale/remota
interface ActivationInfo {
  activationTimestamp: number;
  duration: number;
}



// ---- Costanti interne (non di config) ----
const LOCAL_SEEK_DETECT_THRESHOLD_SECONDS = 1.0;
const REMOTE_UPDATE_SUPPRESS_MS = 400;


// ---- Stato interno ----
let syncEnabled = false;
let phase: SyncPhase = "disabled";
let role: SyncRole = "none";

let compatible: "unknown" | "yes" | "no" = "unknown";

let localActivation: ActivationInfo | null = null;
let remoteActivation: ActivationInfo | null = null;

let localDurationSeconds: number | null = null;
let localPositionSeconds = 0;
let localPaused = true;

let lastTickPositionSeconds = 0;
let lastTickPaused = true;

// heartbeat leader → follower
let heartbeatTimer: number | null = null;

// timeout lato follower
let heartbeatWatchdogTimer: number | null = null;
let lastHeartbeatAt = 0;

// finestra di protezione lato follower dopo un manuale locale
let lastLocalManualAt = 0;

// flag per ignorare TICK causati da comandi remoti
let suppressLocalDetectionUntil = 0;

// peer identity per tie-break
const myPeerId = makePeerId();
let remotePeerId: string | null = null;

// UI listeners
const uiListeners: Array<(s: UiState) => void> = [];




// ---- Utils ----
function makePeerId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nowMs(): number {
  return Date.now();
}

function log(...args: unknown[]) {
  if (!syncConfig.debugLogs) return;
  console.debug("[Sync]", ...args);
}

function postToPage(message: any) {
  window.postMessage({ source: "movie-time-content", ...message }, "*");
}

function emitUi(partial: Partial<UiState> = {}) {
  const state: UiState = {
    enabled: syncEnabled,
    phase,
    role,
    compatible,
    lastDriftSeconds: undefined,
    ...partial,
  };
  uiListeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error("[Sync] UI handler error", err);
    }
  });
}




// ---- API esterna ----
export function onSyncUiUpdate(handler: (state: UiState) => void) {
  uiListeners.push(handler);
  emitUi();
}


export function setupVideoSync() {
  setupPageBridge();
  setupSyncChannel();
  startHeartbeatWatchdog();
  emitUi();
}


export function setSyncEnabled(enabled: boolean) {
  if (enabled === syncEnabled) return;

  syncEnabled = enabled;

  if (!enabled) {
    sendDeactivate();
    resetSyncState();
    emitUi();
    return;
  }

  // attivazione
  phase = "activating";
  compatible = "unknown";
  localActivation = {
    activationTimestamp: nowMs(),
    duration: localDurationSeconds ?? 0,
  };
  log("Local activation", localActivation);

  sendActivate(localActivation);
  tryEstablishSync();
  emitUi();
}




// ---- Bridge con lo script di pagina ----
function setupPageBridge() {
  postToPage({ type: "HELLO_REQUEST" });

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "movie-time-bridge") return;

    if (data.type === "HELLO_RESPONSE" && data.info) {
      const dur = typeof data.info.duration === "number" ? data.info.duration : null;
      localDurationSeconds = dur && isFinite(dur) && dur > 0 ? dur : null;
      log("Received HELLO_RESPONSE with duration", localDurationSeconds);
      return;
    }

    if (data.type === "TICK") {
      handleLocalTick(Number(data.time) || 0, !!data.paused);
      return;
    }
  });
}


function handleLocalTick(timeSeconds: number, paused: boolean) {
  localPositionSeconds = timeSeconds;
  localPaused = paused;

  const prevPos = lastTickPositionSeconds;
  const prevPaused = lastTickPaused;

  lastTickPositionSeconds = timeSeconds;
  lastTickPaused = paused;

  if (!syncEnabled || phase !== "synced") return;

  const now = nowMs();
  if (now < suppressLocalDetectionUntil) {
    return;
  }

  const isSeek =
    Math.abs(timeSeconds - prevPos) >= LOCAL_SEEK_DETECT_THRESHOLD_SECONDS;
  const playChange = prevPaused && !paused;
  const pauseChange = !prevPaused && paused;

  const hasLocalUserAction = isSeek || playChange || pauseChange;
  if (!hasLocalUserAction) return;

  lastLocalManualAt = now;
  sendManualState();
}




// ---- Gestione canale di sync (WebRTC) ----
function setupSyncChannel() {
  onSyncMessage((raw: any) => {
    if (!raw || (raw.__ch && raw.__ch !== "sync")) return;
    const msg: SyncWireMessage | undefined = normalizeIncomingMessage(raw);
    if (!msg) return;

    handleSyncMessage(msg);
  });
}


function normalizeIncomingMessage(raw: any): SyncWireMessage | undefined {
  switch (raw.type) {
    case "ACTIVATE":
    case "DEACTIVATE":
    case "FULL_STATE":
    case "AUTO_STATE":
    case "MANUAL_STATE":
      return raw as SyncWireMessage;
    default:
      return undefined;
  }
}


function handleSyncMessage(msg: SyncWireMessage) {
  switch (msg.type) {
    case "ACTIVATE":
      handleActivateMessage(msg);
      break;
    case "DEACTIVATE":
      handleDeactivateMessage();
      break;
    case "FULL_STATE":
      handleFullStateMessage(msg);
      break;
    case "AUTO_STATE":
      handleAutoStateMessage(msg);
      break;
    case "MANUAL_STATE":
      handleManualStateMessage(msg);
      break;
  }
}




// ---- Messaggi di handshake ----
function sendActivate(info: ActivationInfo) {
  const message: ActivateMessage = {
    type: "ACTIVATE",
    activationTimestamp: info.activationTimestamp,
    duration: info.duration,
    peerId: myPeerId,
  };
  sendSync(message);
}


function sendDeactivate() {
  const message: DeactivateMessage = { type: "DEACTIVATE" };
  sendSync(message);
}


function handleActivateMessage(msg: ActivateMessage) {
  remoteActivation = {
    activationTimestamp: msg.activationTimestamp,
    duration: msg.duration,
  };
  remotePeerId = msg.peerId || remotePeerId;
  log("Received ACTIVATE", remoteActivation, "peerId", remotePeerId);

  tryEstablishSync();
}


function handleDeactivateMessage() {
  log("Received DEACTIVATE from peer");

  // Se il peer disattiva il sync, questo lato deve:
  // - considerare il toggle locale come OFF (syncEnabled = false),
  // - resettare lo stato del protocollo,
  // - notificare la UI in modo che il pulsante venga aggiornato.
  syncEnabled = false;
  resetSyncState();
  emitUi();
}


function tryEstablishSync() {
  if (!syncEnabled) return;
  if (!localActivation || !remoteActivation) return;
  if (!remotePeerId) return;
  if (phase === "synced") return;

  const localDur = localActivation.duration;
  const remoteDur = remoteActivation.duration;

  if (
    syncConfig.enabledDurationCheck &&
    localDur > 0 &&
    remoteDur > 0
  ) {
    const relDiff =
      Math.abs(localDur - remoteDur) / Math.max(localDur, remoteDur);
    if (relDiff > syncConfig.maxDurationDeltaRatio) {
      compatible = "no";
      log("Media duration mismatch, cannot sync", { localDur, remoteDur, relDiff });
      emitUi();
      return;
    }
  }

  compatible = "yes";

  const localTs = localActivation.activationTimestamp;
  const remoteTs = remoteActivation.activationTimestamp;

  let newRole: SyncRole;
  if (localTs < remoteTs) {
    newRole = "leader";
  } else if (localTs > remoteTs) {
    newRole = "follower";
  } else {
    if (!remotePeerId) return;
    newRole = myPeerId < remotePeerId ? "leader" : "follower";
  }

  enterSyncedState(newRole);
}




// ---- Stato synced / leader / follower ----
function enterSyncedState(newRole: SyncRole) {
  role = newRole;
  phase = "synced";
  log("Entering synced state as", role);

  if (syncConfig.forcePlaybackRateOnSync) {
    enforcePlaybackRate();
  }

  if (role === "leader") {
    sendFullState();
    startHeartbeat();
  } else {
    stopHeartbeat();
  }

  emitUi();
}


function resetSyncState() {
  phase = "disabled";
  role = "none";
  compatible = "unknown";
  localActivation = null;
  remoteActivation = null;
  remotePeerId = null;
  stopHeartbeat();
}




// ---- Full state / auto heartbeat / manual state ----
function sendFullState() {
  if (role !== "leader" || phase !== "synced") return;

  const now = nowMs();
  const msg: FullStateMessage = {
    type: "FULL_STATE",
    time: localPositionSeconds,
    paused: localPaused,
    duration: localDurationSeconds ?? 0,
    playbackRate: syncConfig.forcePlaybackRateOnSync
      ? syncConfig.forcedPlaybackRate
      : 1.0,
    sentAt: now,
  };
  log("Sending FULL_STATE", msg);
  sendSync(msg);
}


function handleFullStateMessage(msg: FullStateMessage) {
  if (!syncEnabled) return;

  lastHeartbeatAt = nowMs();
  if (phase !== "synced") {
    role = role === "none" ? "follower" : role;
    phase = "synced";
  }

  if (syncConfig.forcePlaybackRateOnSync) {
    enforcePlaybackRate();
  }

  applyRemoteState(msg.time, msg.paused);
  emitUi({ lastDriftSeconds: 0 });
}


function sendAutoState() {
  if (role !== "leader" || phase !== "synced") return;

  const now = nowMs();
  const msg: AutoStateMessage = {
    type: "AUTO_STATE",
    time: localPositionSeconds,
    paused: localPaused,
    sentAt: now,
  };
  sendSync(msg);
}


function handleAutoStateMessage(msg: AutoStateMessage) {
  if (!syncEnabled) return;
  if (phase !== "synced") return;
  if (role !== "follower") return;

  const now = nowMs();
  lastHeartbeatAt = now;

  const timeSinceLocalManual = now - lastLocalManualAt;
  if (timeSinceLocalManual < syncConfig.suppressAutoMessagesAfterLocalMs) {
    log("Ignoring AUTO_STATE due to recent local manual action");
    return;
  }

  const latencySeconds = (now - msg.sentAt) / 1000;
  const leaderTime = msg.time + latencySeconds;
  const drift = Math.abs(localPositionSeconds - leaderTime);

  emitUi({ lastDriftSeconds: drift });

  if (drift >= syncConfig.hardDesyncThresholdSeconds) {
    log("Hard desync, applying AUTO_STATE", { drift, leaderTime, paused: msg.paused });
    applyRemoteState(leaderTime, msg.paused);
  }
}


function sendManualState() {
  if (phase !== "synced") return;

  const now = nowMs();
  const msg: ManualStateMessage = {
    type: "MANUAL_STATE",
    time: localPositionSeconds,
    paused: localPaused,
    sentAt: now,
  };
  log("Sending MANUAL_STATE", msg);
  sendSync(msg);
}


function handleManualStateMessage(msg: ManualStateMessage) {
  if (!syncEnabled) return;
  if (phase !== "synced") return;

  const now = nowMs();
  lastHeartbeatAt = now;

  const latencySeconds = (now - msg.sentAt) / 1000;
  const leaderTime = msg.time + latencySeconds;

  const drift = Math.abs(localPositionSeconds - leaderTime);
  log("Applying MANUAL_STATE (last manual wins)", { drift, leaderTime, paused: msg.paused });

  applyRemoteState(leaderTime, msg.paused);
  emitUi({ lastDriftSeconds: drift });
}




// ---- Applicazione dei comandi remoti al player ----
function applyRemoteState(timeSeconds: number, paused: boolean) {
  const now = nowMs();
  suppressLocalDetectionUntil = now + REMOTE_UPDATE_SUPPRESS_MS;

  if (syncConfig.forcePlaybackRateOnSync) {
    enforcePlaybackRate();
  }

  postToPage({ type: "SEEK", time: timeSeconds });

  if (paused) {
    postToPage({ type: "PAUSE" });
  } else {
    postToPage({ type: "PLAY" });
  }
}


function enforcePlaybackRate() {
  postToPage({
    type: "SET_RATE",
    rate: syncConfig.forcedPlaybackRate,
  });
}




// ---- Heartbeat leader e watchdog follower ----
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (!syncEnabled || phase !== "synced" || role !== "leader") return;
    sendAutoState();
  }, syncConfig.autoSyncIntervalMs) as unknown as number;
}


function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}


function startHeartbeatWatchdog() {
  if (heartbeatWatchdogTimer !== null) return;

  heartbeatWatchdogTimer = window.setInterval(() => {
    if (!syncEnabled) return;
    if (phase === "degraded") return;
    if (phase !== "synced") return;
    if (role !== "follower") return;

    const now = nowMs();
    if (lastHeartbeatAt === 0) return;

    const elapsed = now - lastHeartbeatAt;
    if (elapsed > syncConfig.leaderHeartbeatTimeoutMs) {
      phase = "degraded";
      log("Leader heartbeat timeout, entering degraded state");
      emitUi();
    }
  }, 1000) as unknown as number;
}
