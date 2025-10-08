import { RTCLink, getSingletonRTC } from "./webrtc";
import { setupVideoSync } from "./videoSync";
import { createOverlay } from "./overlay";

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
      if (msg.type === "CREATE_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        console.log("[Content] Creating offer...");
        const offer = await rtc.createOffer(); // solo DataChannel: non servono tracce locali
        console.log("[Content] Offer created:", offer?.type);
        sendResponse({ offer });
        return;
      }

      if (msg.type === "CONNECT_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        const offerObj = typeof msg.offer === "string" ? JSON.parse(msg.offer) : msg.offer;
        console.log("[Content] Applying remote offer & creating answer...");
        const answer = await rtc.applyRemote(offerObj);
        console.log("[Content] Answer ready");
        sendResponse({ answer });
        return;
      }

      if (msg.type === "APPLY_ANSWER") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        // ⚠️ FIX TYPO: JSO → JSON
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
      console.log("[Content] From page:", ev.data);
      if (ev.data.type === "SYNC_EVENT") {
        chrome.runtime.sendMessage({ type: "SYNC_EVENT", data: ev.data });
      }
    });

    // Overlay UI
    try {
      createOverlay();
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
