console.log("[BG] Service Worker started");



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

  // --- Signaling WebRTC: CREATE_SESSION / CONNECT_SESSION / APPLY_ANSWER ---
  if (["CREATE_SESSION", "CONNECT_SESSION", "APPLY_ANSWER"].includes(msg?.type)) {
    (async () => {
      try {
        const tabId = await getActiveTabId();
        if (!tabId) {
          console.warn("[BG] No active tab found");
          sendResponse({ error: "NO_ACTIVE_TAB" });
          return;
        }

        const ready = await waitForContent(tabId);
        if (!ready) {
          console.error("[BG] Content not ready on this page");
          sendResponse({
            error: "CONTENT_NOT_READY",
            hint: "Apri una scheda Netflix, ricarica la pagina e riprova.",
          });
          return;
        }

        console.log("[BG] Forwarding signaling to content:", msg.type);
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

    // opzionale: limita ai domini Netflix
    if (url.includes("netflix.com")) {
      console.log("[BG] Page reload on Netflix tab, clearing popup state");
      chrome.storage.local.remove([
        "mt_offer",
        "mt_answer",
        "mt_incomingOffer",
        "mt_answerForPeer",
        "mt_activeStep",
      ]);
    }
  }
});
