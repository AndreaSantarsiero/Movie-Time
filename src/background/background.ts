console.log("[BG] Service Worker started");



async function ensureContentReady(tabId: number): Promise<boolean> {
  try {
    console.log("[BG] Injecting content.js into tab:", tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    console.log("[BG] content.js injected");
  } catch (err) {
    console.warn("[BG] content.js injection error (maybe already loaded):", err);
  }

  // PING inline di emergenza, così abbiamo SEMPRE un responder
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (!(window as any).__movieTimePingInstalled) {
          // @ts-ignore
          (window as any).__movieTimePingInstalled = true;
          chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
            if (msg?.type === "PING") {
              console.log("[ContentBootstrap] PING → PONG");
              sendResponse({ pong: true });
            }
          });
          console.log("[ContentBootstrap] PING handler installed");
        }
      },
    });
    console.log("[BG] Inline PING handler injected");
  } catch (err) {
    console.error("[BG] Failed to inject inline PING handler:", err);
  }

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
  console.warn("[BG] Content script did not respond to PING");
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

    const ready = await ensureContentReady(tabId);
    if (!ready) {
      console.error("[BG] Content not ready, abort");
      sendResponse?.({ error: "CONTENT_NOT_READY" });
      return;
    }

    console.log("[BG] Forwarding to content:", msg.type);
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.error("[BG] sendMessage error:", err.message);
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
