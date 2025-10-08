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



/**
 * 2) HANDLER EARLY per i messaggi dal BG (CREATE_SESSION / CONNECT_SESSION / APPLY_ANSWER)
 *    — registrato SUBITO a livello top, così il BG non prende più "message port closed".
 *    — IMPORTANTISSIMO: return true per tenere aperta la porta finché non chiamiamo sendResponse.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ignoriamo i messaggi che non ci interessano qui
  if (!msg || (msg.type !== "CREATE_SESSION" && msg.type !== "CONNECT_SESSION" && msg.type !== "APPLY_ANSWER")) {
    return; // no return true => porta chiusa subito, ma va bene per msg non gestiti qui
  }

  console.log("[Content] Message from BG (early handler):", msg);

  (async () => {
    try {
      if (msg.type === "CREATE_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        console.log("[Content] Creating offer...");
        const offer = await rtc.createOffer(); // solo DataChannel
        console.log("[Content] Offer created:", offer?.type);
        sendResponse?.({ offer });
        return;
      }

      if (msg.type === "CONNECT_SESSION") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        const offerObj = JSON.parse(msg.offer);
        console.log("[Content] Applying remote offer & creating answer...");
        const answer = await rtc.applyRemote(offerObj); // ritorna l'answer
        console.log("[Content] Answer ready");
        sendResponse?.({ answer });
        return;
      }

      if (msg.type === "APPLY_ANSWER") {
        const rtc = getSingletonRTC() ?? new RTCLink();
        const ans = JSON.parse(msg.answer);
        console.log("[Content] Applying remote answer...");
        await rtc.applyRemote(ans);
        console.log("[Content] Answer applied OK");
        sendResponse?.({ ok: true });
        return;
      }
    } catch (err: any) {
      console.error("[Content] Handler error:", err);
      try { sendResponse?.({ error: String(err?.message ?? err) }); } catch {}
    }
  })();

  // Mantiene aperta la porta per la risposta async
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
