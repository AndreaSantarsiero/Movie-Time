// API:
//   setupVideoSync()
//   setSyncEnabled(on: boolean, becomeLeader?: boolean)   // default leader lato singolo
//   onSyncUiUpdate(cb: (s: UiState) => void)
//

import { sendSync, onSyncMessage } from "./webrtc";

// —— Parametri di sincronizzazione ——
const HEARTBEAT_MS = 500;
const SEEK_LOCAL_DETECT_S = 1.50;   // per takeover quando follower interagisce davvero

// Anti-jitter
const DISCRETE_COOLDOWN_MS = 900;    // min distanza tra PLAY/PAUSE applicati dal follower
const DRIFT_SEEK_COOLDOWN_MS = 2000; // min distanza tra SEEK di correzione dal follower
const STATE_PAUSE_HYST_MS = 900;     // tempo minimo di coerenza (da STATE) per cambiare pausa
const DRIFT_PLAYING_THRESHOLD_S = 1.6;
const DRIFT_PAUSED_THRESHOLD_S  = 2.5;
const SUPPRESS_MS = 800;             // evita takeover da TICK indotti da azione remota

// Correzione dolce (smoothing)
const SOFT_DRIFT_MIN_S = 0.25;     // drift minimo per attivare smoothing (solo in play)
const SOFT_RATE_DELTA = 0.04;      // ±4%: 1.04 se sono indietro, 0.96 se sono avanti
const SOFT_CORRECTION_MS = 1500;   // durata della correzione dolce


// Leadership stability
const TAKEOVER_GRACE_MS = 3000;          // tempo minimo dall'ultima azione remota applicata
const ROLE_SWITCH_COOLDOWN_MS = 5000;    // tempo minimo tra cambi di ruolo locali
const LEADER_FRESH_MS = 4000;            // finestra entro cui il leader è considerato "vivo"

// Matching robusto
const DURATION_TOL_S = 180;

type Role = "idle" | "leader" | "follower";

type ContentInfo = {
  contentId: string | null;
  title: string | null;
  duration: number | null;
  providerHost?: string | null; // e.g., "www.netflix.com"
};

type UiState = {
  enabled: boolean;
  role: Role;
  match: boolean;
  lastDrift?: number;
};

// —— Stato locale ——
let enabled = false;
let role: Role = "idle";

let myContent: ContentInfo = { contentId: null, title: null, duration: null, providerHost: null };
let peerContent: ContentInfo | null = null;

let lastTickTime = 0;
let lastPaused = true;
let prevTime = 0;
let prevPaused = true;

let heartbeatTimer: number | null = null;
let seq = 0;

const uiHandlers: Array<(s: UiState) => void> = [];

// Peer identity (negoziazione deterministica)
const myPeerId = makePeerId();
let peerPeerId: string | null = null;

// Anti-loop / anti-jitter timers
let suppressUntil = 0;                   // soppressione takeover dopo azione remota
let lastSeekApplyAt = 0;                 // ultimo SEEK applicato dal follower
let lastPauseChangeApplyAt = 0;          // ultimo PLAY/PAUSE applicato dal follower
let softCorrUntil = 0;                   // fine finestra attiva della correzione dolce
let pauseMismatchSince: number | null = null; // inizio del disallineamento stato (da STATE)

// Leadership tracking
let lastLeaderMsgAt = 0;                 // ultimo messaggio ricevuto da leader (PLAY/PAUSE/SEEK/STATE/TAKEOVER)
let lastRemoteAffectAt = 0;              // ultima volta che ho APPLICATO un comando remoto
let lastRoleSwitchAt = 0;                // ultimo cambio del mio ruolo



// —— Utils ——
function makePeerId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
}
function now(): number { return Date.now(); }

function normalizeTitle(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function titlesSimilar(a: string | null, b: string | null): boolean {
  const A = normalizeTitle(a);
  const B = normalizeTitle(b);
  if (!A || !B) return false;
  if (A.length < 5 || B.length < 5) return A === B;
  return A.includes(B) || B.includes(A) || A === B;
}



// —— UI ——
function emitUi(extra: Partial<UiState> = {}) {
  const state: UiState = {
    enabled,
    role,
    match: computeMatch(),
    ...extra,
  };
  uiHandlers.forEach((fn) => {
    try { fn(state); } catch (e) { console.error("[Sync] UI handler error:", e); }
  });
}
export function onSyncUiUpdate(fn: (s: UiState) => void) {
  uiHandlers.push(fn);
  emitUi();
}



// —— Matching contenuto ——
function computeMatch(): boolean {
  if (!myContent || !peerContent) return false;
  if (myContent.contentId && peerContent.contentId && myContent.contentId === peerContent.contentId) return true;

  const sameProvider = !!myContent.providerHost && !!peerContent.providerHost && myContent.providerHost === peerContent.providerHost;
  const d1 = myContent.duration ?? 0;
  const d2 = peerContent.duration ?? 0;
  const durOk = d1 > 0 && d2 > 0 ? Math.abs(d1 - d2) <= DURATION_TOL_S : true;
  const titleOk = titlesSimilar(myContent.title ?? null, peerContent.title ?? null);
  return sameProvider && durOk && titleOk;
}

function postToPage(msg: any) {
  window.postMessage({ source: "movie-time-content", ...msg }, "*");
}

function startSoftCorrection(deltaRate: number, durationMs = SOFT_CORRECTION_MS) {
  // Non fare smoothing se siamo in pausa
  if (lastPaused) return;

  // Evita di impilare correzioni
  const tNow = now();
  if (tNow < softCorrUntil) return;

  softCorrUntil = tNow + durationMs;

  // Imposta il rate lato pagina
  postToPage({ type: "SET_RATE", rate: 1 + deltaRate });

  // Ripristina il rate a fine finestra
  window.setTimeout(() => {
    if (now() >= softCorrUntil) {
      postToPage({ type: "CLEAR_RATE" });
      softCorrUntil = 0;
    }
  }, durationMs + 50);
}

// Applica un comando remoto, avvia soppressione, traccia "affect"
function applyRemoteCommand(msg: { type: "PLAY" | "PAUSE" | "SEEK"; time?: number }) {
  suppressUntil = now() + SUPPRESS_MS;
  lastRemoteAffectAt = now();
  if (msg.type === "PLAY") {
    postToPage({ type: "PLAY" });
  } else if (msg.type === "PAUSE") {
    postToPage({ type: "PAUSE" });
  } else if (msg.type === "SEEK") {
    postToPage({ type: "SEEK", time: Number(msg.time) || 0 });
  }
}

// —— Elezione ruolo deterministica ——
function electRoleIfNeeded() {
  if (!enabled || !peerPeerId) return;
  if (role === "leader") {
    if (myPeerId < peerPeerId) { role = "follower"; stopHeartbeat(); } else { startHeartbeat(); }
    emitUi();
  } else if (role === "follower") {
    stopHeartbeat();
    emitUi();
  }
}



// —— Setup pagina <-> content ——
export function setupVideoSync() {
  try { myContent.providerHost = location.hostname || null; } catch { myContent.providerHost = null; }
  postToPage({ type: "HELLO_REQUEST" });

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "movie-time-bridge") return;

    if (d.type === "HELLO_RESPONSE" && d.info) {
      myContent = {
        contentId: d.info.contentId ?? null,
        title: d.info.title ?? null,
        duration: typeof d.info.duration === "number" ? d.info.duration : null,
        providerHost: myContent.providerHost ?? (location.hostname || null),
      };
      sendSync({ type: "HELLO", content: myContent, peerId: myPeerId, seq: ++seq });
      emitUi();
      electRoleIfNeeded();
      return;
    }

    if (d.type === "TICK") {
      lastTickTime = Number(d.time) || 0;
      lastPaused = !!d.paused;

      const localSeek = Math.abs(lastTickTime - prevTime) > SEEK_LOCAL_DETECT_S;
      const playChange = prevPaused && !lastPaused;
      const pauseChange = !prevPaused && lastPaused;

      if (enabled) {
        const tNow = now();
        const underSuppress = tNow < suppressUntil;

        if (role === "leader") {
          if (playChange) sendSync({ type: "PLAY", time: lastTickTime, seq: ++seq });
          else if (pauseChange) sendSync({ type: "PAUSE", time: lastTickTime, seq: ++seq });
          if (localSeek) sendSync({ type: "SEEK", time: lastTickTime, seq: ++seq });
        } else if (role === "follower") {
          // Takeover SOLO se:
          // - reale interazione locale (play/pause/seek)
          // - non sotto soppressione
          // - leader non fresco (nessun msg recente)
          // - è passato il grace da ultimo remote affect
          // - rispetto cooldown tra cambi ruolo
          const hasLocalIntent = (playChange || pauseChange || localSeek);
          const leaderIsFresh = (tNow - lastLeaderMsgAt) <= LEADER_FRESH_MS;
          const graceOk = (tNow - lastRemoteAffectAt) > TAKEOVER_GRACE_MS;
          const roleCooldownOk = (tNow - lastRoleSwitchAt) > ROLE_SWITCH_COOLDOWN_MS;

          if (hasLocalIntent && !underSuppress && !leaderIsFresh && graceOk && roleCooldownOk) {
            role = "leader";
            lastRoleSwitchAt = tNow;
            startHeartbeat();
            const action = localSeek ? "SEEK" : (lastPaused ? "PAUSE" : "PLAY");
            sendSync({ type: "TAKEOVER", action, time: lastTickTime, seq: ++seq });
            if (action === "SEEK") sendSync({ type: "SEEK", time: lastTickTime, seq: ++seq });
            if (action === "PLAY") sendSync({ type: "PLAY", time: lastTickTime, seq: ++seq });
            if (action === "PAUSE") sendSync({ type: "PAUSE", time: lastTickTime, seq: ++seq });
            emitUi();
          }
        }
      }

      prevTime = lastTickTime;
      prevPaused = lastPaused;
      return;
    }
  });



  // —— DataChannel (peer → me) ——
  onSyncMessage((msg) => {
    if (!msg || (msg.__ch !== "sync" && !msg.type)) return;

    // Ogni messaggio ricevuto aggiorna freschezza del leader
    lastLeaderMsgAt = now();

    // HELLO del peer
    if (msg.type === "HELLO" && msg.content) {
      peerContent = {
        contentId: msg.content.contentId ?? null,
        title: msg.content.title ?? null,
        duration: typeof msg.content.duration === "number" ? msg.content.duration : null,
        providerHost: msg.content.providerHost ?? null,
      };
      peerPeerId = typeof msg.peerId === "string" && msg.peerId ? msg.peerId : peerPeerId;
      electRoleIfNeeded();
      emitUi();
      return;
    }

    // Comandi discreti → lui Leader, io Follower
    if (msg.type === "PLAY" || msg.type === "PAUSE" || msg.type === "SEEK" || msg.type === "TAKEOVER") {
      if (role !== "follower") {
        role = "follower";
        lastRoleSwitchAt = now();
        stopHeartbeat();
        emitUi();
      }
      if (!computeMatch()) return;

      const tNow = now();

      if (msg.type === "TAKEOVER") {
        const act = msg.action as "PLAY" | "PAUSE" | "SEEK";
        if (act === "PLAY") {
          if (tNow - lastPauseChangeApplyAt > DISCRETE_COOLDOWN_MS) {
            applyRemoteCommand({ type: "PLAY" });
            lastPauseChangeApplyAt = tNow;
          }
        } else if (act === "PAUSE") {
          if (tNow - lastPauseChangeApplyAt > DISCRETE_COOLDOWN_MS) {
            applyRemoteCommand({ type: "PAUSE" });
            lastPauseChangeApplyAt = tNow;
          }
        } else if (act === "SEEK") {
          if (tNow - lastSeekApplyAt > DRIFT_SEEK_COOLDOWN_MS) {
            applyRemoteCommand({ type: "SEEK", time: Number(msg.time) || 0 });
            lastSeekApplyAt = tNow;
          }
        }
      } else if (msg.type === "PLAY") {
        if (tNow - lastPauseChangeApplyAt > DISCRETE_COOLDOWN_MS) {
          applyRemoteCommand({ type: "PLAY" });
          lastPauseChangeApplyAt = tNow;
        }
      } else if (msg.type === "PAUSE") {
        if (tNow - lastPauseChangeApplyAt > DISCRETE_COOLDOWN_MS) {
          applyRemoteCommand({ type: "PAUSE" });
          lastPauseChangeApplyAt = tNow;
        }
      } else if (msg.type === "SEEK") {
        if (tNow - lastSeekApplyAt > DRIFT_SEEK_COOLDOWN_MS) {
          applyRemoteCommand({ type: "SEEK", time: Number(msg.time) || 0 });
          lastSeekApplyAt = tNow;
        }
      }
      return;
    }

    // STATE del Leader → solo follower lo usa
    if (msg.type === "STATE") {
      if (!computeMatch()) return;
      if (role !== "follower") return;

      const sentAt = Number(msg.sentAt) || Date.now();
      const remoteTime = (Number(msg.time) || 0) + (Date.now() - sentAt) / 1000;
      const drift = Math.abs(lastTickTime - remoteTime);
      const tNow = now();

      // Correzione tempo con deadband + cooldown
      const playing = !lastPaused;
      const driftThreshold = playing ? DRIFT_PLAYING_THRESHOLD_S : DRIFT_PAUSED_THRESHOLD_S;
      if (drift > driftThreshold && (tNow - lastSeekApplyAt > DRIFT_SEEK_COOLDOWN_MS)) {
        applyRemoteCommand({ type: "SEEK", time: remoteTime });
        lastSeekApplyAt = tNow;
      }
      else if (playing && drift >= SOFT_DRIFT_MIN_S && drift < driftThreshold) {
        // Se sto INDIETRO rispetto al leader → accelero di +4% (1.04).
        // Se sto AVANTI → rallento di -4% (0.96).
        const iAmBehind = lastTickTime < remoteTime;
        const delta = iAmBehind ? +SOFT_RATE_DELTA : -SOFT_RATE_DELTA;
        startSoftCorrection(delta);
      }

      // Hysteresis sullo stato (PLAY/PAUSE) da STATE
      const leaderPaused = !!msg.paused;
      if (leaderPaused !== lastPaused) {
        if (pauseMismatchSince == null) pauseMismatchSince = tNow;
        const stableFor = tNow - pauseMismatchSince;
        if (stableFor >= STATE_PAUSE_HYST_MS && (tNow - lastPauseChangeApplyAt > DISCRETE_COOLDOWN_MS)) {
          applyRemoteCommand({ type: leaderPaused ? "PAUSE" : "PLAY" });
          lastPauseChangeApplyAt = tNow;
          pauseMismatchSince = null;
        }
      } else {
        pauseMismatchSince = null;
      }

      emitUi({ lastDrift: drift });
    }
  });
}



// —— API ——

// Di default chi abilita diventa leader (utile se il peer non ha ancora attivato)
export async function setSyncEnabled(on: boolean, becomeLeader = true): Promise<void> {
  enabled = on;
  if (!enabled) {
    role = "idle";
    stopHeartbeat();
    emitUi();
    return;
  }

  const shouldLead = becomeLeader || !peerPeerId;
  role = shouldLead ? "leader" : "follower";
  lastRoleSwitchAt = now();
  emitUi();

  try { myContent.providerHost = location.hostname || null; } catch { myContent.providerHost = myContent.providerHost ?? null; }
  postToPage({ type: "HELLO_REQUEST" });

  if (myContent.contentId || myContent.duration || myContent.title) {
    sendSync({ type: "HELLO", content: myContent, peerId: myPeerId, seq: ++seq });
  }

  if (role === "leader") startHeartbeat(); else stopHeartbeat();
  electRoleIfNeeded();
}

// —— Heartbeat STATE del Leader ——
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    if (!enabled || role !== "leader") return;
    sendSync({
      type: "STATE",
      time: lastTickTime,
      paused: lastPaused,
      sentAt: Date.now(),
      seq: ++seq,
    });
  }, HEARTBEAT_MS) as unknown as number;
}
function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}
