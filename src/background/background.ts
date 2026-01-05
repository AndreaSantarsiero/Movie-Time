console.log("[BG] Service Worker started");


const POPUP_STATE_KEYS = [
  "mt_offer",
  "mt_answer",
  "mt_incomingOffer",
  "mt_answerForPeer",
  "mt_activeStep",
];

// Tab video corrente associata alla sessione di Movie Time
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

        // Se non abbiamo ancora una tab di sessione, scegliamo la tab attiva
        if (tabId == null) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

          if (!activeTab || !activeTab.id) {
            console.warn("[BG] No active tab found");
            sendResponse({
              error: "NO_ACTIVE_TAB",
              hint: "Please open a video page and try again.",
            });
            return;
          }

          // Verifichiamo se l'URL è supportato o se non è una pagina di sistema
          if (!activeTab.url || activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:")) {
            console.warn("[BG] Restricted tab", activeTab.url);
            sendResponse({
              error: "RESTRICTED_TAB",
              hint: "Movie Time cannot run on this page. Please open a regular video site.",
            });
            return;
          }

          tabId = activeTab.id;
          currentSessionTabId = activeTab.id;
          console.log("[BG] Binding session to tab", activeTab.id, activeTab.url);
        }

        const ready = await waitForContent(tabId);
        if (!ready) {
          console.error("[BG] Content not ready on session tab", tabId);
          sendResponse({
            error: "CONTENT_NOT_READY",
            hint: "Make sure the video page is loaded, then reload it and try again.",
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


  // --- Registrazione tab ---
  if (msg?.type === "REGISTER_TAB") {
    if (sender.tab?.id != null) {
      console.log("[BG] REGISTER_TAB from video tab", sender.tab.id);
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
      console.log("[BG] Session tab reloading, clearing session and popup state");
      currentSessionTabId = null;
      chrome.storage.local.remove(POPUP_STATE_KEYS);
    }
  }
});



// --- Reset stato sessione quando la tab viene chiusa ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentSessionTabId) {
    console.log("[BG] Session tab closed, clearing session and popup state");
    currentSessionTabId = null;
    chrome.storage.local.remove(POPUP_STATE_KEYS);
  }
});
