import { setLocalStream, onRemoteStream, getSingletonRTC } from "./webrtc";
import { setSyncEnabled, onSyncUiUpdate } from "./videoSync";



// Stato condiviso per fake / real media + sender
let __fakeStream: MediaStream | null = null;
let __fakeVideoTrack: MediaStreamTrack | null = null;
let __fakeAudioTrack: MediaStreamTrack | null = null;

let __realStream: MediaStream | null = null;
let __realVideoTrack: MediaStreamTrack | null = null;
let __realAudioTrack: MediaStreamTrack | null = null;

let __videoSender: RTCRtpSender | null = null;
let __audioSender: RTCRtpSender | null = null;

let __fakeAudioContext: AudioContext | null = null;
let __fakeAudioSourceNode: AudioNode | null = null;

let __videoChatStarted = false;



function ensureSenders(): { video: RTCRtpSender | null; audio: RTCRtpSender | null } {
  const rtc = getSingletonRTC();
  if (!rtc || !rtc.pc) return { video: null, audio: null };

  if (!__videoSender || !__audioSender) {
    const senders = rtc.pc.getSenders();
    if (!__videoSender) {
      __videoSender = senders.find((s) => s.track && s.track.kind === "video") || null;
      if (!__videoSender) {
        console.warn("[Overlay] No video RTCRtpSender found yet");
      }
    }
    if (!__audioSender) {
      __audioSender = senders.find((s) => s.track && s.track.kind === "audio") || null;
      if (!__audioSender) {
        console.warn("[Overlay] No audio RTCRtpSender found yet");
      }
    }
  }

  return { video: __videoSender, audio: __audioSender };
}



/**
 * Crea un MediaStream finto con:
 * - video nero da canvas
 * - audio muto da AudioContext
 */
function createFakeAVStream(width = 640, height = 360): MediaStream {
  // Video nero
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);
  }
  const videoStream = canvas.captureStream(5);
  const videoTrack = videoStream.getVideoTracks()[0] || null;

  // Audio muto
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  // Sorgente silenziosa: un Oscillator via Gain a 0
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0; // muto
  osc.connect(gain).connect(dest);
  osc.start();

  const audioTrack = dest.stream.getAudioTracks()[0] || null;

  const combined = new MediaStream();
  if (videoTrack) combined.addTrack(videoTrack);
  if (audioTrack) combined.addTrack(audioTrack);

  __fakeStream = combined;
  __fakeVideoTrack = videoTrack;
  __fakeAudioTrack = audioTrack;
  __fakeAudioContext = audioCtx;
  __fakeAudioSourceNode = osc;

  return combined;
}



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
      #sync-status {
        font-size: 12px;
        opacity: .85;
        align-self: center;
        white-space: nowrap;
      }
    </style>
    <div id="wrapper">
      <video id="remote" autoplay playsinline></video>
      <video id="local" autoplay muted playsinline></video>
      <div id="controls">
        <button id="sync" title="Enable/Disable Sync">🔄</button>
        <span id="sync-status">Sync: off</span>
        <button id="mute">🎙️</button>
        <button id="cam">🎥</button>
        <button id="close">❌</button>
      </div>
    </div>
  `;



  // Auto-hide controls (mostra su attività/tocco, nascondi dopo idle)
  let hideTimer: number | null = null;

  function showControls(temp: boolean = true) {
    container.classList.add("show-controls");
    if (temp) {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        container.classList.remove("show-controls");
      }, 1500); // tempo di visibilità dopo l'ultima attività
    }
  }

  container.addEventListener("mousemove", () => showControls(true), { passive: true });
  container.addEventListener("touchstart", () => showControls(true), { passive: true });

  shadow.addEventListener("focusin", () => showControls(false));
  shadow.addEventListener("focusout", () => showControls(true));

  showControls(true);

  const controlsEl = shadow.getElementById("controls") as HTMLElement | null;

  if (controlsEl) {
    const onPointerUp = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("button") as HTMLButtonElement | null;
      if (btn) btn.blur();
      showControls(true);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("button") as HTMLButtonElement | null;
      if (btn) btn.blur();
      showControls(true);
    };

    if ("onpointerup" in window) {
      controlsEl.addEventListener("pointerup", onPointerUp as EventListener, { passive: true });
    } else {
      controlsEl.addEventListener("click", onClick as EventListener);
    }
  }

  container.addEventListener("keydown", (ev: KeyboardEvent) => {
    const k = ev.key;
    if (
      k === "Tab" || k === "Enter" || k === " " ||
      k === "ArrowLeft" || k === "ArrowRight" ||
      k === "ArrowUp" || k === "ArrowDown"
    ) {
      showControls(false);
    }
  });

  container.addEventListener("mouseleave", () => {
    const hasFocusInside = !!shadow.activeElement && shadow.contains(shadow.activeElement);
    if (!hasFocusInside) {
      showControls(true);
    }
  });


  
  document.body.appendChild(container);

  // Drag semplice del contenitore
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

  const btnSync = shadow.getElementById("sync") as HTMLButtonElement;
  const txtStatus = shadow.getElementById("sync-status") as HTMLSpanElement;
  const local = shadow.getElementById("local") as HTMLVideoElement;
  const remote = shadow.getElementById("remote") as HTMLVideoElement;
  const btnMute = shadow.getElementById("mute") as HTMLButtonElement;
  const btnCam = shadow.getElementById("cam") as HTMLButtonElement;
  const btnClose = shadow.getElementById("close") as HTMLButtonElement;


  // --- Media fake iniziali per la negoziazione ---
  const fakeStream = createFakeAVStream();
  local.srcObject = fakeStream;
  // Notifica al layer WebRTC il nostro flusso locale (fake)
  setLocalStream(fakeStream);

  // Stato iniziale bottoni: consideriamo cam/mic "off" dal punto di vista umano
  if (btnMute) {
    btnMute.classList.add("off");
    btnMute.setAttribute("aria-pressed", "true");
  }
  if (btnCam) {
    btnCam.classList.add("off");
    btnCam.setAttribute("aria-pressed", "true");
  }

  // Ricezione stream remoto
  onRemoteStream((s) => {
    remote.srcObject = s;
    remote.muted = false;
    const tryPlay = () =>
      remote.play().catch((err) => {
        console.warn("[Overlay] Autoplay blocked:", err?.name);
        showClickToStart(remote);
      });

    if (remote.readyState >= 2) tryPlay();
    else remote.onloadedmetadata = () => tryPlay();
  });

  // Toggle Sync
  let syncOn = false;

  btnSync.onclick = async () => {
    syncOn = !syncOn;
    try {
      await setSyncEnabled(syncOn);
    } catch (err) {
      console.error("[Overlay] Failed to toggle sync:", err);
    }
  };

  // Aggiorna badge stato sync in base alla UiState del protocollo
  onSyncUiUpdate((state) => {
    syncOn = state.enabled;

    btnSync.classList.toggle("off", !state.enabled);
    btnSync.setAttribute("aria-pressed", String(state.enabled));

    const phaseLabel = (() => {
      switch (state.phase) {
        case "disabled": return "off";
        case "activating": return "activating";
        case "synced": return "";
        case "degraded": return "degraded";
        default: return state.phase;
      }
    })();

    const parts: string[] = [];

    if (phaseLabel) parts.push(phaseLabel);
    if (state.role !== "none") parts.push(state.role);

    if (state.compatible === "yes") parts.push("match");
    if (state.compatible === "no") parts.push("mismatch");

    if (typeof state.lastDriftSeconds === "number") {
      parts.push(`Δ ${state.lastDriftSeconds.toFixed(1)}s`);
    }

    txtStatus.textContent = parts.join(" · ");
  });

  btnMute.onclick = () => toggleMute(local, btnMute);
  btnCam.onclick = () => {
    // Per ora il toggleCam agisce sullo stream attuale (fake o real),
    // la logica di passare ai media REALI la facciamo in startOverlayVideoChat().
    void toggleCam(local, btnCam);
  };

  btnClose.onclick = async () => {
    try {
      // disabilita la sync
      await setSyncEnabled(false);
    } catch {
      // ignore
    }

    // Spegni davvero tutte le tracce locali prima di chiudere l'overlay
    const localStream = local.srcObject as MediaStream | null;
    if (localStream) {
      localStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      local.srcObject = null;
    }

    // Spegni anche eventuali tracce remote
    const remoteStream = remote.srcObject as MediaStream | null;
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      remote.srcObject = null;
    }

    // Chiudi la RTCPeerConnection se esiste
    try {
      const rtc = getSingletonRTC();
      if (rtc && rtc.pc) {
        // stoppa eventuali track associate ai sender
        rtc.pc.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {
            // ignore
          }
        });
        rtc.pc.close();
      }
    } catch (err) {
      console.warn("[Overlay] Failed to close RTCPeerConnection:", err);
    }

    // Chiudi risorse fake
    if (__fakeAudioSourceNode && __fakeAudioContext) {
      try {
        (__fakeAudioSourceNode as any).stop?.();
      } catch {
        /* ignore */
      }
    }
    if (__fakeAudioContext) {
      try {
        __fakeAudioContext.close();
      } catch {
        /* ignore */
      }
    }

    if (__realVideoTrack) {
      try {
        __realVideoTrack.stop();
      } catch {
        /* ignore */
      }
    }
    if (__realAudioTrack) {
      try {
        __realAudioTrack.stop();
      } catch {
        /* ignore */
      }
    }

    __fakeStream = null;
    __fakeVideoTrack = null;
    __fakeAudioTrack = null;
    __realStream = null;
    __realVideoTrack = null;
    __realAudioTrack = null;
    __videoSender = null;
    __audioSender = null;
    __fakeAudioContext = null;
    __fakeAudioSourceNode = null;
    __videoChatStarted = false;

    container.remove();
  };
}



/**
 * Da chiamare DOPO che la connessione WebRTC è stabilita
 * e l'overlay è stato reso visibile (content.ts / onRTCConnected).
 * Qui chiediamo i media REALI e sostituiamo le tracce finte con replaceTrack.
 */
export async function startOverlayVideoChat() {
  if (__videoChatStarted) return;
  __videoChatStarted = true;

  const container = document.getElementById("movie-time-overlay");
  if (!container) {
    console.warn("[Overlay] startOverlayVideoChat: overlay not found");
    __videoChatStarted = false;
    return;
  }
  const shadow = container.shadowRoot;
  if (!shadow) {
    console.warn("[Overlay] startOverlayVideoChat: shadowRoot not found");
    __videoChatStarted = false;
    return;
  }

  const local = shadow.getElementById("local") as HTMLVideoElement | null;
  const btnMute = shadow.getElementById("mute") as HTMLButtonElement | null;
  const btnCam = shadow.getElementById("cam") as HTMLButtonElement | null;

  if (!local) {
    console.warn("[Overlay] startOverlayVideoChat: local video not found");
    __videoChatStarted = false;
    return;
  }

  try {
    const real = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    __realStream = real;
    __realVideoTrack = real.getVideoTracks()[0] || null;
    __realAudioTrack = real.getAudioTracks()[0] || null;

    const { video, audio } = ensureSenders();

    if (video && __realVideoTrack) {
      try {
        await video.replaceTrack(__realVideoTrack);
      } catch (err) {
        console.error("[Overlay] replaceTrack (video real) failed:", err);
      }
    }
    if (audio && __realAudioTrack) {
      try {
        await audio.replaceTrack(__realAudioTrack);
      } catch (err) {
        console.error("[Overlay] replaceTrack (audio real) failed:", err);
      }
    }

    // Preview locale con media reali
    local.srcObject = real;

    if (btnMute) {
      btnMute.classList.remove("off");
      btnMute.setAttribute("aria-pressed", "false");
    }
    if (btnCam) {
      btnCam.classList.remove("off");
      btnCam.setAttribute("aria-pressed", "false");
    }

    console.log("[Overlay] Real video chat started (tracks replaced)");
  } catch (err) {
    console.error("[Overlay] Failed to acquire real media, staying on fake tracks:", err);
    // Non facciamo throw: manteniamo i fake media e non blocchiamo niente.
    // Lasciamo i pulsanti in stato "off".
    __videoChatStarted = false; // opzionale: permette un eventuale retry in futuro
  }
}



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



function toggleMute(local: HTMLVideoElement, btn?: HTMLButtonElement) {
  const stream = local.srcObject as MediaStream | null;
  if (!stream) return;

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;

  const currentlyOn = audioTracks.some((t) => t.enabled);
  audioTracks.forEach((t) => {
    t.enabled = !currentlyOn;
  });

  if (btn) {
    const micOn = audioTracks.some((t) => t.enabled);
    btn.classList.toggle("off", !micOn);
    btn.setAttribute("aria-pressed", String(!micOn));
  }
}



/**
 * Per ora il toggleCam agisce semplicemente sull'abilitazione delle tracce video
 * del local.srcObject (che può essere fake o real). La logica "fake → real" è
 * gestita centralmente in startOverlayVideoChat.
 */
async function toggleCam(local: HTMLVideoElement, btn?: HTMLButtonElement) {
  const stream = local.srcObject as MediaStream | null;
  if (!stream) return;

  const videoTracks = stream.getVideoTracks();
  if (videoTracks.length === 0) return;

  const currentlyOn = videoTracks.some((t) => t.enabled);
  videoTracks.forEach((t) => {
    t.enabled = !currentlyOn;
  });

  if (btn) {
    const camOn = videoTracks.some((t) => t.enabled);
    btn.classList.toggle("off", !camOn);
    btn.setAttribute("aria-pressed", String(!camOn));
  }
}
