import { sendSync, onSyncMessage } from "./webrtc";



// —— Parametri di sincronizzazione ——
const HEARTBEAT_MS = 500;                // frequenza invio STATE del leader
const SEEK_HARD_DRIFT_S = 0.75;          // hard correction
const SEEK_SOFT_DRIFT_S = 0.30;          // soglia "soft" (qui applichiamo direttamente seek per semplicità)
const SEEK_LOCAL_DETECT_S = 1.50;        // salto locale che consideriamo "seek" intenzionale


type Role = "idle" | "leader" | "follower";

type ContentInfo = {
  contentId: string | null;
  title: string | null;
  duration: number | null;
};

type UiState = {
  enabled: boolean;
  role: Role;
  match: boolean;
  local?: ContentInfo | null;
  remote?: ContentInfo | null;
  lastDrift?: number;
};

type SyncWire =
  | { __ch?: "sync"; type: "HELLO"; content: ContentInfo; origin: "me" | "peer"; seq: number }
  | { __ch?: "sync"; type: "PLAY" | "PAUSE" | "SEEK"; time: number; origin: "me" | "peer"; seq: number }
  | { __ch?: "sync"; type: "STATE"; time: number; paused: boolean; sentAt: number; origin: "me" | "peer"; seq: number };



let role: Role = "idle";
let enabled = false;
let seq = 0;

let localInfo: ContentInfo | null = null;
let remoteInfo: ContentInfo | null = null;
let match = false;

let lastTickTime = 0;
let lastPaused = true;

let heartbeatTimer: number | null = null;



const uiListeners: Array<(s: UiState) => void> = [];
function emitUi(partial?: Partial<UiState>) {
  const state: UiState = {
    enabled, role, match,
    local: localInfo, remote: remoteInfo
  };
  if (partial && "lastDrift" in partial) (state as any).lastDrift = (partial as any).lastDrift;
  uiListeners.forEach(fn => fn(state));
}


function postToPage(msg: any) {
  window.postMessage({ source: "movie-time-content", ...msg }, "*");
}


function requestLocalContentInfo(timeoutMs = 1500): Promise<ContentInfo> {
  return new Promise((resolve) => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.source === "movie-time-bridge" && ev.data?.type === "HELLO_RESPONSE") {
        window.removeEventListener("message", onMsg);
        resolve(ev.data.info as ContentInfo);
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "movie-time-content", type: "HELLO_REQUEST" }, "*");
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve({ contentId: null, title: null, duration: null });
    }, timeoutMs);
  });
}


function computeMatch(a: ContentInfo | null, b: ContentInfo | null): boolean {
  if (!a?.contentId || !b?.contentId) return false;
  if (a.contentId !== b.contentId) return false;
  // opzionale: durata entro ±2s
  if (a.duration != null && b.duration != null) {
    if (Math.abs(a.duration - b.duration) > 2.0) return false;
  }
  return true;
}



// ——— API per l’overlay ———
export function onSyncUiUpdate(cb: (s: UiState) => void) {
  uiListeners.push(cb);
  emitUi();
}


export async function setSyncEnabled(on: boolean, becomeLeader = true) {
  enabled = on;
  if (!on) {
    role = "idle";
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    emitUi();
    return;
  }

  // handshake: scopri contenuto locale e invia HELLO
  localInfo = await requestLocalContentInfo();
  sendSync({ type: "HELLO", content: localInfo, origin: "me", seq: ++seq });

  // se chi attiva vuole essere leader, setta il ruolo
  role = becomeLeader ? "leader" : "follower";

  // il leader spedisce STATE periodico
  if (role === "leader") {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = window.setInterval(() => {
      // useremo lastTickTime/lastPaused aggiornati dai TICK
      sendSync({ type: "STATE", time: lastTickTime, paused: lastPaused, sentAt: Date.now(), origin: "me", seq: ++seq });
    }, HEARTBEAT_MS);
  }
  emitUi();
}



// ——— Wiring eventi dal bridge (TICK) ———
export function setupVideoSync() {
  window.addEventListener("message", (ev) => {
    if (ev.data?.source !== "movie-time-bridge") return;

    const { type, time, paused } = ev.data;
    if (type === "TICK") {
      // Aggiorna telemetria locale
      const prevTime = lastTickTime;
      const prevPaused = lastPaused;
      lastTickTime = time;
      lastPaused = paused;

      if (!enabled) return;

      // Solo il LEADER emette comandi discreti immediati
      if (role === "leader") {
        // Detect PLAY/PAUSE
        if (prevPaused && !paused) {
          sendSync({ type: "PLAY", time, origin: "me", seq: ++seq });
        } else if (!prevPaused && paused) {
          sendSync({ type: "PAUSE", time, origin: "me", seq: ++seq });
        }
        // Detect SEEK intenzionale
        if (Math.abs(time - prevTime) > SEEK_LOCAL_DETECT_S) {
          sendSync({ type: "SEEK", time, origin: "me", seq: ++seq });
        }
        // Nota: lo STATE periodico parte dal timer
      }
    }
  });

  // Ricezione messaggi dalla DataChannel
  onSyncMessage((msg: SyncWire) => {
    // Ignora eventuali loop (se qualcuno ti rimanda indietro un tuo msg)
    if ((msg as any).origin === "me") return;

    if (msg.type === "HELLO") {
      remoteInfo = msg.content;
      match = computeMatch(localInfo, remoteInfo);
      emitUi();
      return;
    }

    if (!enabled) return;      // non applicare nulla se il sync è OFF

    // Se siamo follower, applichiamo 1:1 i comandi discreti
    if (role === "follower") {
      if (msg.type === "PLAY")  postToPage({ type: "PLAY" });
      if (msg.type === "PAUSE") postToPage({ type: "PAUSE" });
      if (msg.type === "SEEK")  postToPage({ type: "SEEK", time: msg.time });
      if (msg.type === "STATE") {
        // Correzione drift
        const remoteTime = msg.time + (Date.now() - msg.sentAt) / 1000; // stima semplice RTT/2 ignorato per semplicità
        const drift = Math.abs(lastTickTime - remoteTime);
        if (drift > SEEK_SOFT_DRIFT_S) {
          postToPage({ type: "SEEK", time: remoteTime });
        }
        if (msg.paused !== lastPaused) {
          // allinea lo stato pausa se disallineato
          postToPage({ type: msg.paused ? "PAUSE" : "PLAY" });
        }
        emitUi({ lastDrift: drift });
      }
    }
  });
}
