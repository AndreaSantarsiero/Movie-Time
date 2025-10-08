import { setLocalStream, onRemoteStream } from "./webrtc";



export function createOverlay() {

  if (document.getElementById("movie-time-overlay")) return;

  const container = document.createElement("div");
  container.id = "movie-time-overlay";
  container.style.position = "fixed";
  container.style.top = "20px";
  container.style.right = "20px";
  container.style.zIndex = "999999";
  container.style.width = "300px";
  container.style.height = "220px";
  container.style.resize = "both";
  container.style.overflow = "hidden";
  container.style.borderRadius = "16px";
  container.style.boxShadow = "0 0 12px rgba(0,0,0,0.6)";
  container.style.background = "rgba(0,0,0,0.8)";
  container.style.color = "white";
  container.style.userSelect = "none";



  const shadow = container.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: sans-serif; }
      #wrapper { display: flex; flex-direction: column; height: 100%; position: relative; }
      video {
        width: 100%; height: 100%;
        background: black; object-fit: cover;
        border-radius: 8px;
      }
      #local { position: absolute; bottom: 10px; right: 10px; width: 80px; height: 60px; border: 2px solid white; }
      #controls {
        display: flex; justify-content: space-around;
        padding: 4px; background: rgba(0,0,0,0.4);
        position: absolute; bottom: 0; width: 100%;
      }
      button {
        background: rgba(255,255,255,0.1);
        color: white; border: none; border-radius: 8px;
        padding: 4px 6px; cursor: pointer;
      }
      button:hover { background: rgba(255,255,255,0.25); }
    </style>
    <div id="wrapper">
      <video id="remote" autoplay playsinline></video>
      <video id="local" autoplay muted playsinline></video>
      <div id="controls">
        <button id="mute">🎙️</button>
        <button id="cam">🎥</button>
        <button id="close">❌</button>
      </div>
    </div>
  `;



  document.body.appendChild(container);

  // drag…
  let isDragging = false, offsetX = 0, offsetY = 0;
  container.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    isDragging = true;
    offsetX = e.clientX - container.offsetLeft;
    offsetY = e.clientY - container.offsetTop;
  });
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    container.style.left = e.clientX - offsetX + "px";
    container.style.top = e.clientY - offsetY + "px";
  });
  window.addEventListener("mouseup", () => (isDragging = false));

  const local = shadow.getElementById("local") as HTMLVideoElement;
  const remote = shadow.getElementById("remote") as HTMLVideoElement;
  const btnMute = shadow.getElementById("mute") as HTMLButtonElement;
  const btnCam = shadow.getElementById("cam") as HTMLButtonElement;
  const btnClose = shadow.getElementById("close") as HTMLButtonElement;

  // Avvia videochat
  initVideoChat(local, remote);

  btnMute.onclick = () => toggleMute(local);
  btnCam.onclick = () => toggleCam(local);
  btnClose.onclick = () => container.remove();
}



async function initVideoChat(local: HTMLVideoElement, remote: HTMLVideoElement) {
  // Chiede webcam + microfono (l’utente deve consentire)
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  local.srcObject = stream;

  // Passa lo stream al layer WebRTC
  setLocalStream(stream);

  // Quando arriva il remoto, mostrane il video
  onRemoteStream((s) => {
    remote.srcObject = s;
    remote.muted = false; // vuoi sentire l'altra persona
    const tryPlay = () => remote.play().catch((err) => {
      console.warn("[Overlay] Autoplay blocked:", err?.name);
      // Mostra un pulsante "Avvia"
      showClickToStart(remote);
    });
    if (remote.readyState >= 2) tryPlay();
    else remote.onloadedmetadata = () => tryPlay();
  });

  function showClickToStart(videoEl: HTMLVideoElement) {
    const btn = document.createElement("button");
    btn.textContent = "Avvia chiamata";
    btn.style.position = "absolute";
    btn.style.left = "50%";
    btn.style.top = "50%";
    btn.style.transform = "translate(-50%, -50%)";
    btn.style.padding = "8px 12px";
    btn.style.borderRadius = "8px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.background = "rgba(255,255,255,0.85)";
    btn.onclick = () => {
      videoEl.play().catch((e) => console.error("play() failed", e));
      btn.remove();
    };
    videoEl.parentElement?.appendChild(btn);
  }
}



function toggleMute(local: HTMLVideoElement) {
  const stream = local.srcObject as MediaStream;
  if (!stream) return;
  stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
}



function toggleCam(local: HTMLVideoElement) {
  const stream = local.srcObject as MediaStream;
  if (!stream) return;
  stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
}
