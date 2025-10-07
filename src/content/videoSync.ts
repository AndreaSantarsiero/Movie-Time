import { log } from "../utils/logger";

export function setupVideoSync() {
  window.addEventListener("message", (ev) => {
    if (ev.data?.source !== "movie-time-bridge") return;

    const { type, time, paused } = ev.data;
    if (type === "TICK") {
      chrome.runtime.sendMessage({ type: "SYNC_EVENT", data: { time, paused } });
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SYNC_EVENT") {
      window.postMessage({ source: "movie-time-content", ...msg.data }, "*");
    }
  });
}
