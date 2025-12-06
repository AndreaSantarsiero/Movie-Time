import { RTCLink, getSingletonRTC, waitForLocalStream, onRTCConnected, onCallClosed } from "./webrtc";
import { setupVideoSync } from "./videoSync";
import { createOverlay, startOverlayVideoChat } from "./overlay";

let __relocationSetupDone = false;
let __overlayHiddenInitially = false;

console.log("[Content] Loaded start");



/**
 * 1) PING handler: PRIMA di tutto
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    console.log("[Content] PING → PONG");
    sendResponse({ pong: true });
  }
});



/**
 * 2) Signaling WebRTC (CREATE_SESSION / CONNECT_SESSION / APPLY_ANSWER)
 *    Handler anticipato: deve rispondere anche se il resto del setup fallisce.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !["CREATE_SESSION", "CONNECT_SESSION", "APPLY_ANSWER"].includes(msg.type)) {
    return; // ignoriamo altri messaggi qui
  }

  console.log("[Content] Message from BG (early handler):", msg);

  (async () => {
    try {
      // CREATE_SESSION
      if (msg.type === "CREATE_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        console.log("[Content] Creating offer...");
        await waitForLocalStream(10000);
        const offer = await rtc.createOffer();
        console.log("[Content] Offer created:", offer?.type);
        sendResponse({ offer });
        return;
      }

      // CONNECT_SESSION (genera l’answer a partire dall’offerta ricevuta)
      if (msg.type === "CONNECT_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        const offerObj = typeof msg.offer === "string" ? JSON.parse(msg.offer) : msg.offer;
        console.log("[Content] Applying remote offer & creating answer...");
        await waitForLocalStream(10000);
        const answer = await rtc.applyRemote(offerObj);
        console.log("[Content] Answer ready");
        sendResponse({ answer });
        return;
      }

      // APPLY_ANSWER (lato caller)
      if (msg.type === "APPLY_ANSWER") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        const ansObj = typeof msg.answer === "string" ? JSON.parse(msg.answer) : msg.answer;
        console.log("[Content] Applying remote answer...");
        await rtc.applyRemote(ansObj);
        console.log("[Content] Answer applied");
        sendResponse({ ok: true });
        return;
      }
    } catch (err: any) {
      console.error("[Content] Signaling error:", err);
      sendResponse({ error: err?.message ?? String(err) });
    }
  })();

  // IMPORTANTISSIMO: porta aperta SUBITO
  return true;
});



/**
 * Mostra l'overlay (se esiste ancora) – chiamato quando la connessione è pronta
 */
function showOverlayIfPresent() {
  try {
    const overlayEl = document.getElementById("movie-time-overlay");
    if (!overlayEl) {
      console.warn("[Content] showOverlayIfPresent: overlay element not found");
      return;
    }
    if (!overlayEl.isConnected) {
      // l'utente potrebbe averlo rimosso (tasto ❌), in quel caso rispettiamo la scelta
      console.log("[Content] showOverlayIfPresent: overlay not connected to DOM, skipping");
      return;
    }

    // rimuovi l'hide iniziale
    overlayEl.style.display = "";
    console.log("[Content] Overlay made visible after RTC connection");
  } catch (e) {
    console.error("[Content] Failed to show overlay:", e);
  }
}



/**
 * 3) Init sicuro del resto (bridge/overlay/videosync)
 *    — anche se qualcosa fallisse qui, la parte di signaling è già attiva.
 */
(function init() {
  try {
    console.log("[Content] Registering tab");
    chrome.runtime.sendMessage({ type: "REGISTER_TAB" });

    // Inietta bridge per Netflix Player API (contesto pagina)
    try {
      const s = document.createElement("script");
      s.src = chrome.runtime.getURL("overlayBridge.js");
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      console.log("[Content] overlayBridge injected");
    } catch (e) {
      console.error("[Content] Failed to inject overlayBridge:", e);
    }

    // Overlay UI (creato subito, ma tenuto nascosto finché non c'è una connessione RTC)
    try {
      createOverlay();
      setupOverlayRelocation();

      const overlayEl = document.getElementById("movie-time-overlay");
      if (overlayEl) {
        overlayEl.style.display = "none";
        __overlayHiddenInitially = true;
        console.log("[Content] Overlay created but initially hidden");
      } else {
        console.warn("[Content] Overlay element not found right after createOverlay");
      }
    } catch (e) {
      console.error("[Content] Overlay failed:", e);
    }

    // Video sync (bridge page<->content + protocollo)
    try {
      setupVideoSync();
      console.log("[Content] VideoSync set up");
    } catch (e) {
      console.error("[Content] VideoSync failed:", e);
    }

    // Quando la connessione RTC viene considerata "stabilita", mostriamo l'overlay
    // e passiamo dai media finti ai media reali (se disponibili).
    onRTCConnected(() => {
      console.log("[Content] onRTCConnected → show overlay + start real video chat");
      if (__overlayHiddenInitially) {
        showOverlayIfPresent();
        __overlayHiddenInitially = false;
      } else {
        // in caso fosse già visibile per qualche motivo, assicuriamoci comunque
        showOverlayIfPresent();
      }

      // Avvia la richiesta di webcam/microfono reali + replaceTrack
      startOverlayVideoChat().catch((err) => {
        console.error("[Content] Failed to start overlay video chat:", err);
      });
    });

    console.log("[Content] Setup done");
  } catch (err) {
    console.error("[Content] Fatal init error:", err);
  }
})();



/**
 * Chiusura chiamata da parte del peer remoto:
 * rimuovere overlay, ripulire media, resettare tutto.
 */
onCallClosed(() => {
  console.log("[Content] Remote CLOSE_CALL received → closing overlay and resetting state");

  const overlayEl = document.getElementById("movie-time-overlay");
  if (overlayEl && overlayEl.isConnected) {
    try {
      overlayEl.remove();
    } catch {}
  }

  // reset integrale dello stato dell'estensione, come su reload tab
  try {
    chrome.runtime.sendMessage({ type: "RESET_STATE" });
  } catch {}
});



/**
 * —— Overlay relocation per il fullscreen ——
 * Mantiene l'overlay visibile anche quando il player entra in fullscreen,
 * spostandolo dentro document.fullscreenElement e rimettendolo nel parent di default all'uscita.
 *
 * Se però l'overlay viene rimosso dal DOM (es. tasto ❌ nell'overlay),
 * NON viene più ricreato: consideriamo la chiamata chiusa definitivamente.
 */
function setupOverlayRelocation() {
  if (__relocationSetupDone) return;
  __relocationSetupDone = true;

  function getDefaultOverlayParent(): HTMLElement {
    const candidates = [
      ".watch-video",
      '[data-uia="player"]',
      "#appMountPoint",
      "body",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) return el;
    }
    return document.body;
  }

  function getOverlayEl(): HTMLElement {
    const el = document.getElementById("movie-time-overlay");
    if (!el) {
      throw new Error(
        "[MovieTime] overlay non trovato: assicurati che createOverlay() sia stato già chiamato"
      );
    }
    return el as HTMLElement;
  }

  const defaultParent = getDefaultOverlayParent();
  const overlayEl = getOverlayEl();

  if (!overlayEl.isConnected) {
    defaultParent.appendChild(overlayEl);
  }

  function relocateOverlayForFullscreen() {
    // Se l'overlay è stato rimosso, NON lo resuscitiamo
    if (!overlayEl.isConnected) {
      return;
    }

    const fsEl = document.fullscreenElement as HTMLElement | null;
    const shouldBeParent = fsEl || defaultParent;

    if (overlayEl.parentElement !== shouldBeParent) {
      shouldBeParent.appendChild(overlayEl);
    }
  }

  document.addEventListener("fullscreenchange", relocateOverlayForFullscreen);
  relocateOverlayForFullscreen();

  const overlayObserver = new MutationObserver(() => {
    // Se l'overlay non è più connesso al DOM, assumiamo che sia stato chiuso
    // intenzionalmente: smettiamo di osservare e NON lo ricreiamo.
    if (!overlayEl.isConnected) {
      overlayObserver.disconnect();
      return;
    }

    const fsEl = document.fullscreenElement as HTMLElement | null;
    const shouldBeParent = fsEl || defaultParent;

    if (overlayEl.parentElement !== shouldBeParent) {
      shouldBeParent.appendChild(overlayEl);
    }
  });

  overlayObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
