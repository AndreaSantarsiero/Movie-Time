import { setLocalStream, onRemoteStream } from "./webrtc";
import { setSyncEnabled, onSyncUiUpdate } from "./videoSync";



export function createOverlay() {

  if (document.getElementById("movie-time-overlay")) return;

  const container = document.createElement("div");
  container.id = "movie-time-overlay";
  container.style.position = "fixed";
  container.style.top = "70px";
  container.style.right = "20px";
  container.style.zIndex = "2147483647";
  container.style.width = "300px";
  container.style.height = "220px";
  container.style.resize = "both";
  container.style.overflow = "hidden";
  container.style.borderRadius = "16px";
  container.style.boxShadow = "0 0 12px rgba(0,0,0,0.6)";
  container.style.background = "rgba(0,0,0,0.8)";
  container.style.color = "white";
  container.style.userSelect = "none";
  container.style.pointerEvents = "auto";



  const shadow = container.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: sans-serif; }
      #wrapper { display: flex; flex-direction: column; height: 100%; position: relative; }
      video {
        width: 100%; height: 100%;
        background: black; object-fit: cover;
        border-radius: 8px;
        pointer-events: none;
      }
      :host(:hover) #controls,
      :host(:focus-within) #controls,
      :host(.show-controls) #controls { pointer-events: auto; }
      #local { 
        position: absolute; bottom: 10px; right: 10px; width: 80px; height: 60px; border: 2px solid white;
        transform: scaleX(-1);
        transform-origin: center;
      }
      #controls {
        display: flex; justify-content: space-around;
        padding: 4px; background: rgba(0,0,0,0.4);
        position: absolute; bottom: 0; width: 100%;
        opacity: 0; visibility: hidden; transform: translateY(6px);
        pointer-events: none;
        transition: opacity .15s ease, visibility .15s ease, transform .15s ease;
      }
      :host(:hover) #controls,
      :host(:focus-within) #controls,
      :host(.show-controls) #controls {
        opacity: 1; visibility: visible; transform: none;
        pointer-events: auto;
      }
      button {
        background: rgba(255,255,255,0.1);
        color: white; border: none; border-radius: 8px;
        padding: 4px 6px; cursor: pointer;
      }
      button:hover { background: rgba(255,255,255,0.25); }
      button.off { background: rgba(255, 60, 60, 0.35); }
      button.off:hover { background: rgba(255, 60, 60, 0.5); }
    </style>
    <div id="wrapper">
      <video id="remote" autoplay playsinline></video>
      <video id="local" autoplay muted playsinline></video>
      <div id="controls">
        <button id="sync" title="Enable/Disable Sync">🔄</button>
        <span id="sync-status" style="font-size:12px; opacity:.85; align-self:center;">Match: —</span>
        <button id="mute">🎙️</button>
        <button id="cam">🎥</button>
        <button id="close">❌</button>
      </div>
    </div>
  `;



  // Auto-hide controls (mostra su attività/tocco, nascondi dopo idle)
  let __hideTimer: number | null = null;

  function showControls(temp: boolean = true) {
    container.classList.add("show-controls");
    if (temp) {
      if (__hideTimer !== null) window.clearTimeout(__hideTimer);
      __hideTimer = window.setTimeout(() => {
        container.classList.remove("show-controls");
      }, 1500); // tempo di visibilità dopo l'ultima attività
    }
  }

  // Mostra temporaneamente quando l'utente muove il mouse o tocca l'overlay
  container.addEventListener("mousemove", () => showControls(true), { passive: true });
  container.addEventListener("touchstart", () => showControls(true), { passive: true });

  // Mantieni visibile mentre si interagisce via tastiera (focus su bottoni)
  shadow.addEventListener("focusin", () => showControls(false));
  shadow.addEventListener("focusout", () => showControls(true));

  // Mostra brevemente all'avvio per far capire che ci sono i controlli
  showControls(true);

  // Gestione focus dei controlli per farli nascondere dopo click/tap 
  const controlsEl = shadow.getElementById("controls") as HTMLElement | null;

  if (controlsEl) {
    // Dopo il click col mouse/touch, rimuovi il focus dal bottone e avvia il timer di hide
    // (PointerEvent copre mouse/pen/touch)
    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("button") as HTMLButtonElement | null;
      if (btn) btn.blur();       // termina :focus-within quando non si usa tastiera
      showControls(true);        // parte il timer di auto-hide
    };

    // Fallback per ambienti senza PointerEvent (vecchi browser)
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("button") as HTMLButtonElement | null;
      if (btn) btn.blur();
      showControls(true);
    };

    // Registra gli handler in modo sicuro
    if ("onpointerup" in window) {
      controlsEl.addEventListener("pointerup", onPointerUp as EventListener, { passive: true });
    } else {
      controlsEl.addEventListener("click", onClick as EventListener);
    }
  }

  // ascolta il keydown sull'HOST (container) invece che sullo shadow
  container.addEventListener("keydown", (ev: KeyboardEvent) => {
    const k = ev.key;
    if (
      k === "Tab" || k === "Enter" || k === " " ||
      k === "ArrowLeft" || k === "ArrowRight" ||
      k === "ArrowUp" || k === "ArrowDown"
    ) {
      showControls(false); // resta visibile finché c'è focus
    }
  });

  // Nascondi quando il mouse esce dall'overlay (se non c'è più focus dentro)
  container.addEventListener("mouseleave", () => {
    const hasFocusInside = !!shadow.activeElement && shadow.contains(shadow.activeElement);
    if (!hasFocusInside) {
      showControls(true); // farà partire il timer e poi spariscono
    }
  });




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

  const btnSync  = shadow.getElementById("sync") as HTMLButtonElement;
  const txtMatch = shadow.getElementById("sync-status") as HTMLSpanElement;
  const local = shadow.getElementById("local") as HTMLVideoElement;
  const remote = shadow.getElementById("remote") as HTMLVideoElement;
  const btnMute = shadow.getElementById("mute") as HTMLButtonElement;
  const btnCam = shadow.getElementById("cam") as HTMLButtonElement;
  const btnClose = shadow.getElementById("close") as HTMLButtonElement;

  // Avvia videochat
  initVideoChat(local, remote);

  // toggle Sync: chi clicca diventa leader
  let syncOn = false;
  btnSync.onclick = async () => {
    syncOn = !syncOn;
    await setSyncEnabled(syncOn, /*becomeLeader*/ true);
    btnSync.classList.toggle("off", !syncOn);
    btnSync.setAttribute("aria-pressed", String(syncOn));
  };

  // aggiorna badge Match/ruolo e stato bottone
  onSyncUiUpdate((s) => {
    txtMatch.textContent = `Match: ${s.match ? "OK" : "NO"}${s.enabled ? ` · ${s.role}` : ""}`;
    btnSync.classList.toggle("off", !s.enabled);
  });

  btnMute.onclick = () => toggleMute(local, btnMute);
  btnCam.onclick = () => toggleCam(local, btnCam);
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



function toggleMute(local: HTMLVideoElement, btn?: HTMLButtonElement) {
  const stream = local.srcObject as MediaStream;
  if (!stream) return;
  // flip stato audio
  stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
  // aggiorna sfondo bottone (rosso se OFF)
  if (btn) {
    const micOn = stream.getAudioTracks().some((t) => t.enabled);
    btn.classList.toggle("off", !micOn);
    btn.setAttribute("aria-pressed", String(!micOn));
  }
}



function toggleCam(local: HTMLVideoElement, btn?: HTMLButtonElement) {
  const stream = local.srcObject as MediaStream;
  if (!stream) return;
  // flip stato video
  stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
  // aggiorna sfondo bottone (rosso se OFF)
  if (btn) {
    const camOn = stream.getVideoTracks().some((t) => t.enabled);
    btn.classList.toggle("off", !camOn);
    btn.setAttribute("aria-pressed", String(!camOn));
  }
}
