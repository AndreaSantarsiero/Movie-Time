import { RTCLink, getSingletonRTC, waitForLocalStream } from "./webrtc";
import { setupVideoSync } from "./videoSync";
import { createOverlay } from "./overlay";

let __relocationSetupDone = false;
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



// HANDLER EARLY: CREATE_SESSION / CONNECT_SESSION / APPLY_ANSWER
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

      // APPLY_ANSWER (lato caller, non serve attendere la webcam qui)
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
 * 3) Init sicuro del resto (bridge/overlay/videosync)
 *    — lasciamo invariato, ma anche se fallisse qualcosa qui, l’handler early sopra è già attivo.
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

    // Bridge → BG (per eventuale sync/log)
    window.addEventListener("message", (ev) => {
      if (ev.data?.source !== "movie-time-bridge") return;
      //console.log("[Content] From page:", ev.data);
      if (ev.data.type === "SYNC_EVENT") {
        chrome.runtime.sendMessage({ type: "SYNC_EVENT", data: ev.data });
      }
    });

    // Overlay UI
    try {
      createOverlay();
      setupOverlayRelocation();
    } catch (e) {
      console.error("[Content] Overlay failed:", e);
    }

    // Video sync (messaggi page<->content)
    try {
      setupVideoSync();
      console.log("[Content] VideoSync set up");
    } catch (e) {
      console.error("[Content] VideoSync failed:", e);
    }

    console.log("[Content] Setup done");
  } catch (err) {
    console.error("[Content] Fatal init error:", err);
  }
})();



/**
 * —— Overlay relocation per il fullscreen ——
 * Mantiene l'overlay visibile anche quando il player entra in fullscreen,
 * spostandolo dentro document.fullscreenElement e rimettendolo nel parent di default all'uscita.
 */
function setupOverlayRelocation() {
  if (__relocationSetupDone) return;
  __relocationSetupDone = true;

  function getDefaultOverlayParent(): HTMLElement {
    const candidates = [
      '.watch-video',
      '[data-uia="player"]',
      '#appMountPoint',
      'body'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el instanceof HTMLElement) return el;
    }
    return document.body;
  }

  function getOverlayEl(): HTMLElement {
    const el = document.getElementById('movie-time-overlay');
    if (!el) throw new Error('[MovieTime] overlay non trovato: assicurati che createOverlay() sia stato già chiamato');
    return el as HTMLElement;
  }

  const __overlayDefaultParent = getDefaultOverlayParent();
  const __overlayEl = getOverlayEl();

  if (!__overlayEl.isConnected) {
    __overlayDefaultParent.appendChild(__overlayEl);
  }

  function relocateOverlayForFullscreen() {
    const fsEl = document.fullscreenElement as HTMLElement | null;
    if (fsEl) {
      if (__overlayEl.parentElement !== fsEl) {
        fsEl.appendChild(__overlayEl);
      }
    } else {
      if (__overlayEl.parentElement !== __overlayDefaultParent) {
        __overlayDefaultParent.appendChild(__overlayEl);
      }
    }
  }

  document.addEventListener('fullscreenchange', relocateOverlayForFullscreen);
  relocateOverlayForFullscreen();

  const __overlayObserver = new MutationObserver(() => {
    const shouldBeParent = (document.fullscreenElement as HTMLElement | null) || __overlayDefaultParent;
    if (!__overlayEl.isConnected || __overlayEl.parentElement !== shouldBeParent) {
      shouldBeParent.appendChild(__overlayEl);
    }
  });
  __overlayObserver.observe(document.documentElement, { childList: true, subtree: true });
}

