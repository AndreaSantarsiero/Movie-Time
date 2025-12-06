console.log("[BG] Service Worker started");


const POPUP_STATE_KEYS = [
  "mt_offer",
  "mt_answer",
  "mt_incomingOffer",
  "mt_answerForPeer",
  "mt_activeStep",
];

// Tab Netflix corrente associata alla sessione di Movie Time
let currentSessionTabId: number | null = null;



/** Pinga il content script fino a 10 volte per ~1.5s */
async function waitForContent(tabId: number): Promise<boolean> {
  for (let i = 1; i <= 10; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (res) => {
        const pong = res?.pong === true;
        console.log(`[BG] PING attempt ${i} →`, pong ? "PONG" : "no response");
        resolve(pong);
      });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}


async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}



chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[BG] Message received:", msg);

  // --- Reset completo stato estensione (chiusura chiamata remota o locale) ---
  if (msg?.type === "RESET_STATE") {
    console.log("[BG] RESET_STATE received → clearing session + popup state");
    currentSessionTabId = null;
    chrome.storage.local.remove(POPUP_STATE_KEYS);
    sendResponse?.({ ok: true });
    return;
  }


  // --- Signaling WebRTC: CREATE_SESSION / CONNECT_SESSION / APPLY_ANSWER ---
  if (["CREATE_SESSION", "CONNECT_SESSION", "APPLY_ANSWER"].includes(msg?.type)) {
    (async () => {
      try {
        let tabId = currentSessionTabId;

        // Se non abbiamo ancora una tab di sessione, scegliamo una tab Netflix
        if (tabId == null) {
          const netflixTabs = await chrome.tabs.query({ url: "*://*.netflix.com/*" });

          if (netflixTabs.length === 0) {
            console.warn("[BG] No Netflix tab found");
            sendResponse({
              error: "NO_NETFLIX_TAB",
              hint: "Open a Netflix tab on the page you want to sync and try again.",
            });
            return;
          }

          if (netflixTabs.length > 1) {
            console.warn("[BG] Multiple Netflix tabs found");
            sendResponse({
              error: "MULTIPLE_NETFLIX_TABS",
              hint: "Multiple Netflix tabs are open. Please close all extra Netflix tabs and keep only the one you want to use with Movie Time, then try again.",
            });
            return;
          }

          const t = netflixTabs[0];
          if (!t.id) {
            console.error("[BG] Selected Netflix tab has no id");
            sendResponse({ error: "INVALID_NETFLIX_TAB" });
            return;
          }

          tabId = t.id;
          currentSessionTabId = t.id;
          console.log("[BG] Binding session to Netflix tab", t.id, t.url);
        }

        const ready = await waitForContent(tabId);
        if (!ready) {
          console.error("[BG] Content not ready on session tab", tabId);
          sendResponse({
            error: "CONTENT_NOT_READY",
            hint: "Make sure the Netflix page is loaded, then reload the page and try again.",
          });
          return;
        }

        console.log("[BG] Forwarding signaling to content on tab", tabId, ":", msg.type);
        chrome.tabs.sendMessage(tabId, msg, (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.error("[BG] sendMessage error:", err.message);
            sendResponse({ error: err.message });
            return;
          }
          sendResponse(res ?? { error: "NO_RESPONSE_FROM_CONTENT" });
        });
      } catch (e: any) {
        console.error("[BG] Handler error:", e);
        sendResponse({ error: e?.message ?? String(e) });
      }
    })();

    return true; // keep message channel open
  }


  // --- Registrazione tab Netflix ---
  if (msg?.type === "REGISTER_TAB") {
    if (sender.tab?.id != null) {
      console.log("[BG] REGISTER_TAB from Netflix tab", sender.tab.id);
    } else {
      console.log("[BG] REGISTER_TAB from unknown tab");
    }
    // niente response necessaria
    return;
  }
});



// --- Reset stato popup quando la pagina viene ricaricata ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // status: "loading" viene emesso all'inizio di un reload / navigazione
  if (changeInfo.status === "loading") {
    const url = tab.url || "";

    // Se è la tab di sessione, resettiamo anche lo stato di sessione
    if (tabId === currentSessionTabId) {
      console.log("[BG] Session Netflix tab reloading, clearing session and popup state");
      currentSessionTabId = null;
      chrome.storage.local.remove(POPUP_STATE_KEYS);
    }

    // opzionale: limita ai domini Netflix (comportamento originale)
    if (url.includes("netflix.com")) {
      console.log("[BG] Page reload on Netflix tab, clearing popup state");
      chrome.storage.local.remove(POPUP_STATE_KEYS);
    }
  }
});



// --- Reset stato sessione quando la tab viene chiusa ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentSessionTabId) {
    console.log("[BG] Session Netflix tab closed, clearing session and popup state");
    currentSessionTabId = null;
    chrome.storage.local.remove(POPUP_STATE_KEYS);
  }
});
