import { RTCLink, getSingletonRTC } from "./webrtc";
import { setupVideoSync } from "./videoSync";
import { createOverlay } from "./overlay";

console.log("[Content] Loaded start");



// 1) PING handler: PRIMA di tutto
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    console.log("[Content] PING → PONG");
    sendResponse({ pong: true });
  }
});



// 2) Global error logs (se qualcosa crasha prima dei listener)
window.addEventListener("error", (e) => {
  console.error("[Content] window.onerror:", e.message, e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Content] unhandledrejection:", e.reason);
});



// 3) Init sicuro
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

    // Bridge → BG (per eventuale sync)
    window.addEventListener("message", (ev) => {
      if (ev.data?.source !== "movie-time-bridge") return;
      console.log("[Content] From page:", ev.data);
      if (ev.data.type === "SYNC_EVENT") {
        chrome.runtime.sendMessage({ type: "SYNC_EVENT", data: ev.data });
      }
    });


    // 4) Listener per messaggi dal BG (IMPORTANT: return true SUBITO)
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      console.log("[Content] Message from BG:", msg);
      (async () => {
        try {
          if (msg.type === "CREATE_SESSION") {
            const rtc = getSingletonRTC() ?? new RTCLink();
            console.log("[Content] Creating offer...");
            const offer = await rtc.createOffer(); // solo DataChannel, niente media
            console.log("[Content] Offer created:", offer?.type);
            sendResponse?.({ offer });
            return;
          }

          if (msg.type === "CONNECT_SESSION") {
            const rtc = getSingletonRTC() ?? new RTCLink();
            const offerObj = JSON.parse(msg.offer);
            console.log("[Content] Applying remote offer...");
            const answer = await rtc.applyRemote(offerObj);
            console.log("[Content] Answer generated:", answer?.type);
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

          console.warn("[Content] Unknown message:", msg);
          sendResponse?.({ ok: false, error: "UNKNOWN_MESSAGE" });
        } catch (err: any) {
          console.error("[Content] Handler error:", err);
          try { sendResponse?.({ error: String(err?.message ?? err) }); } catch {}
        }
      })();

      return true; // Mantiene aperta la porta per la risposta async
    });

    
    // 5) Overlay e sync (non bloccanti)
    try {
      createOverlay();
      console.log("[Content] Overlay created");
    } catch (e) {
      console.error("[Content] Overlay failed:", e);
    }

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
