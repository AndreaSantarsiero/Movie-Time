import { SyncMessage } from "../utils/types";

export function setupVideoSync() {
  const video = document.querySelector("video");
  if (!video) {
    console.warn("No <video> element found on page");
    return;
  }

  video.addEventListener("play", () => {
    const msg: SyncMessage = { type: "cmd", action: "play", time: video.currentTime };
    sendSync(msg);
  });

  video.addEventListener("pause", () => {
    const msg: SyncMessage = { type: "cmd", action: "pause", time: video.currentTime };
    sendSync(msg);
  });

  video.addEventListener("seeked", () => {
    const msg: SyncMessage = { type: "cmd", action: "seek", time: video.currentTime };
    sendSync(msg);
  });

  // uscita “ricezione” (da remoto)
  receiveSync(msg => {
    if (msg.action === "play") {
      video.currentTime = msg.time;
      video.play();
    } else if (msg.action === "pause") {
      video.currentTime = msg.time;
      video.pause();
    } else if (msg.action === "seek") {
      video.currentTime = msg.time;
    }
  });
}

// Funzioni stub — da implementare con DataChannel / signaling
function sendSync(msg: SyncMessage) {
  // TODO: invia messaggio al peer tramite DataChannel
  console.log("sendSync:", msg);
}

function receiveSync(callback: (msg: SyncMessage) => void) {
  // TODO: ascolta messaggi in arrivo da DataChannel
  // esempio: dataChannel.onmessage = ev => callback(JSON.parse(ev.data))
}
