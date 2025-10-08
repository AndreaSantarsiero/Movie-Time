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

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  console.log("[BG] Message received:", msg);

  if (["CREATE_SESSION", "CONNECT_SESSION", "APPLY_ANSWER"].includes(msg?.type)) {
    const tabId = await getActiveTabId();
    if (!tabId) {
      console.warn("[BG] No active tab found");
      sendResponse?.({ error: "NO_ACTIVE_TAB" });
      return;
    }

    // ❗️ NON iniettiamo più content.js. Aspettiamo che sia attivo (manifest lo carica).
    const ready = await waitForContent(tabId);
    if (!ready) {
      console.error("[BG] Content not ready on this page");
      sendResponse?.({
        error: "CONTENT_NOT_READY",
        hint: "Ricarica la pagina Netflix e riprova (il content script viene caricato dal manifest).",
      });
      return;
    }

    console.log("[BG] Forwarding to content:", msg.type);
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.error("[BG] sendMessage error:", err, err.message);
        sendResponse?.({ error: err.message });
        return;
      }
      console.log("[BG] Response from content:", res);
      sendResponse?.(res);
    });
    return true; // keep port open
  }

  if (msg?.type === "REGISTER_TAB") {
    console.log("[BG] REGISTER_TAB from Netflix tab");
  }
});
