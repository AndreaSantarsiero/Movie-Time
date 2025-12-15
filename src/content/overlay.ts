import { onRemoteStream, getSingletonRTC, sendCloseCall, onCallClosed, onSyncMessage, sendSync } from "./webrtc";
import { setSyncEnabled, onSyncUiUpdate } from "./videoSync";
import { initEmojiReactions, showEmojiReaction } from "./emojiReactions";
import {
  initFakeLocalMedia,
  startRealMedia,
  enableCamera,
  disableCamera,
  enableAudio,
  disableAudio,
  cleanupUserMedia,
} from "./userMedia";



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
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 6px;
        background: rgba(0,0,0,0.4);
        position: absolute;
        bottom: 0;
        width: 100%;
        opacity: 0;
        visibility: hidden;
        transform: translateY(6px);
        pointer-events: none;
        transition: opacity .15s ease, visibility .15s ease, transform .15s ease;
        gap: 4px;
      }
      :host(:hover) #controls,
      :host(:focus-within) #controls,
      :host(.show-controls) #controls {
        opacity: 1; visibility: visible; transform: none;
        pointer-events: auto;
      }
      #sync-group {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      button {
        background: rgba(255,255,255,0.1);
        color: white; border: none; border-radius: 8px;
        padding: 4px 6px; cursor: pointer;
        flex-shrink: 0;
      }
      button:hover { background: rgba(255,255,255,0.25); }
      button.off { background: rgba(255, 60, 60, 0.35); }
      button.off:hover { background: rgba(255, 60, 60, 0.5); }
      #sync-status {
        font-size: 12px;
        opacity: .85;
        white-space: nowrap;
      }
      #emoji-menu {
        display: flex;
        gap: 6px;
        padding: 6px;
        background: rgba(0,0,0,0.4);
        border-radius: 20px;
        position: absolute;
        bottom: 31px;
        right: 10px;
        opacity: 0;
        visibility: hidden;
        transform: translateY(10px);
        transition: opacity .15s ease, visibility .15s ease, transform .15s ease;
        pointer-events: none;
      }
      #emoji-menu.show-menu {
        opacity: 1; visibility: visible; transform: none;
        pointer-events: auto;
      }
      #emoji-menu button {
        background: rgba(255,255,255,0.1);
        font-size: 16px;
        padding: 6px;
        border-radius: 50%;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.1s;
      }
      #emoji-menu button:hover {
        background: rgba(255,255,255,0.25);
        transform: scale(1.2);
      }
      #emoji-menu button:active {
        transform: scale(0.95);
      }
    </style>
    <div id="wrapper">
      <video id="remote" autoplay playsinline></video>
      <video id="local" autoplay muted playsinline></video>
      <div id="controls">
        <div id="sync-group">
          <button id="sync" title="Enable/Disable Sync">🔄</button>
          <span id="sync-status">off</span>
        </div>
        <button id="mute">🎙️</button>
        <button id="cam">🎥</button>
        <button id="emoji">❤️</button>
        <button id="close">❌</button>
      </div>
      <div id="emoji-menu">
        <button data-emoji="❤️">❤️</button>
        <button data-emoji="😂">😂</button>
        <button data-emoji="😮">😮</button>
        <button data-emoji="😢">😢</button>
        <button data-emoji="🥰">🥰</button>
        <button data-emoji="🔥">🔥</button>
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
        if (container.matches(":hover")) return;

        container.classList.remove("show-controls");
        const em = shadow.getElementById("emoji-menu");
        if (em) em.classList.remove("show-menu");
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



  // Monta l'overlay in modo robusto anche se il body non è ancora pronto
  if (document.body) {
    document.body.appendChild(container);
  } else {
    console.warn("[Overlay] document.body not ready, delaying overlay attach");
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        if (!document.getElementById("movie-time-overlay")) {
          document.body.appendChild(container);
        }
      },
      { once: true }
    );
  }

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
  const btnEmoji = shadow.getElementById("emoji") as HTMLButtonElement;
  const btnClose = shadow.getElementById("close") as HTMLButtonElement;


  // --- Media fake iniziali per la negoziazione ---
  initFakeLocalMedia(local);

  // Inizializza layer emoji
  initEmojiReactions();

  // Stato iniziale bottoni: cam/mic "off" dal punto di vista utente
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


  // Toggle mic: solo ON/OFF.
  // Se l'utente prova ad attivare il mic ma non esiste una traccia audio reale,
  // mostriamo un popup di errore.
  btnMute.onclick = () => {
    const isOff = btnMute.classList.contains("off");

    if (isOff) {
      const ok = enableAudio(local);
      if (!ok) {
        alert(
          "Microfono non disponibile.\n" +
          "Controlla che il microfono sia collegato e che il browser abbia i permessi audio per questo sito."
        );
        // Rimaniamo in stato OFF
        btnMute.classList.add("off");
        btnMute.setAttribute("aria-pressed", "true");
        return;
      }

      btnMute.classList.remove("off");
      btnMute.setAttribute("aria-pressed", "false");
    } else {
      disableAudio(local);
      btnMute.classList.add("off");
      btnMute.setAttribute("aria-pressed", "true");
    }
  };


  // Toggle cam: solo ON/OFF.
  // Se getUserMedia fallisce quando l'utente prova ad accendere la cam,
  // mostriamo un popup di errore.
  btnCam.onclick = () => {
    const isOff = btnCam.classList.contains("off");

    if (isOff) {
      (async () => {
        const ok = await enableCamera(local);
        if (!ok) {
          alert(
            "Camera non disponibile.\n" +
            "Controlla che la webcam sia collegata e che il browser abbia i permessi video per questo sito."
          );
          // Rimaniamo in stato OFF
          btnCam.classList.add("off");
          btnCam.setAttribute("aria-pressed", "true");
          return;
        }

        btnCam.classList.remove("off");
        btnCam.setAttribute("aria-pressed", "false");
      })();
    } else {
      (async () => {
        await disableCamera(local);
        btnCam.classList.add("off");
        btnCam.setAttribute("aria-pressed", "true");
      })();
    }
  };


  // Emoji reaction (locale + sync verso il peer)
  const emojiMenu = shadow.getElementById("emoji-menu");

  if (btnEmoji && emojiMenu) {
    // 1. Toggle menu on Main Heart click
    btnEmoji.onclick = (e) => {
      e.stopPropagation(); // evita che il click venga catturato da logiche globali se ce ne sono
      const isOpen = emojiMenu.classList.contains("show-menu");
      if (isOpen) {
        emojiMenu.classList.remove("show-menu");
      } else {
        emojiMenu.classList.add("show-menu");
        showControls(true); // mantieni viva la UI
      }
    };

    // 2. Click su emoji del menu
    const emojiBtns = emojiMenu.querySelectorAll("button");
    emojiBtns.forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation(); // non chiudere menu
        const emoji = b.getAttribute("data-emoji");
        if (!emoji) return;

        // Invia
        try {
          showEmojiReaction(emoji);
        } catch (e) {
          console.error("[Overlay] Failed to show local emoji reaction:", e);
        }
        try {
          sendSync({ type: "EMOJI_REACTION", emoji });
        } catch (e) {
          console.error("[Overlay] Failed to send emoji reaction over DC:", e);
        }

        // Mantieni UI attiva
        showControls(true);
      };
    });

    // 3. Close on outside click (ma NON se click su controls)
    container.addEventListener("mousedown", (e) => {
      const path = e.composedPath();
      const target = path[0] as HTMLElement;

      // Se il click è dentro il menu emoji o dentro i controlli principali, IGNORA
      const inMenu = emojiMenu.contains(target) || emojiMenu === target;
      const inControls = controlsEl ? (controlsEl.contains(target) || controlsEl === target) : false;

      if (!inMenu && !inControls) {
        emojiMenu.classList.remove("show-menu");
      }
    });

  } else if (btnEmoji) {
    // Fallback vecchio comportamento (se html non aggiornato per qualche motivo)
    btnEmoji.onclick = () => {
      const emoji = "❤️";
      try {
        showEmojiReaction(emoji);
      } catch (e) {
        console.error("[Overlay] Failed to show local emoji reaction:", e);
      }
      try {
        sendSync({ type: "EMOJI_REACTION", emoji });
      } catch (e) {
        console.error("[Overlay] Failed to send emoji reaction over DC:", e);
      }
    };
  }

  // Ricezione emoji dal peer
  onSyncMessage((msg) => {
    if (!msg || msg.__ch !== "sync") return;
    if (msg.type !== "EMOJI_REACTION") return;
    if (typeof msg.emoji !== "string") return;
    try {
      showEmojiReaction(msg.emoji);
    } catch (e) {
      console.error("[Overlay] Failed to show remote emoji reaction:", e);
    }
  });


  // Toggle close-call (locale)
  btnClose.onclick = async () => {
    try {
      // disabilita la sync
      await setSyncEnabled(false);
    } catch {
      // ignore
    }

    // Invio segnale di chiusura all'altro peer
    try {
      sendCloseCall();
    } catch { }

    // Spegni tutte le tracce locali gestite da UserMedia
    cleanupUserMedia();

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

    container.remove();

    // Resetta lo stato dell’estensione localmente
    try {
      chrome.runtime.sendMessage({ type: "RESET_STATE" });
    } catch { }
  };


  // Toggle close-call (remoto)
  onCallClosed(() => {
    try {
      setSyncEnabled(false);
    } catch { }

    cleanupUserMedia();

    const remoteStream = remote.srcObject as MediaStream | null;
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => {
        try { t.stop(); } catch { }
      });
      remote.srcObject = null;
    }

    try {
      const rtc = getSingletonRTC();
      if (rtc && rtc.pc) {
        rtc.pc.getSenders().forEach((s) => {
          try { s.track?.stop(); } catch { }
        });
        rtc.pc.close();
      }
    } catch { }

    container.remove();
  });
}



/**
 * Chiamata da content.ts quando la connessione WebRTC è stabilita.
 * Qui chiediamo i media REALI "full" (video+audio) e, in caso di successo,
 * aggiorniamo lo stato dei pulsanti della UI.
 *
 * In caso di fallimento, NON mostriamo popup: l'utente potrà
 * ritentare manualmente via pulsanti cam/mic e lì vedrà eventuali errori.
 */
export async function startOverlayVideoChat() {
  let containerEl = document.getElementById("movie-time-overlay");
  if (!containerEl) {
    console.warn("[Overlay] startOverlayVideoChat: overlay not found, recreating");
    try {
      createOverlay();
    } catch (e) {
      console.error("[Overlay] Failed to recreate overlay", e);
      return;
    }
    containerEl = document.getElementById("movie-time-overlay");
    if (!containerEl) {
      console.warn("[Overlay] startOverlayVideoChat: overlay still not found after recreate");
      return;
    }
  }

  const container = containerEl;
  const shadow = container.shadowRoot;
  if (!shadow) {
    console.warn("[Overlay] startOverlayVideoChat: shadowRoot not found");
    return;
  }

  const local = shadow.getElementById("local") as HTMLVideoElement | null;
  const btnMute = shadow.getElementById("mute") as HTMLButtonElement | null;
  const btnCam = shadow.getElementById("cam") as HTMLButtonElement | null;

  if (!local) {
    console.warn("[Overlay] startOverlayVideoChat: local video not found");
    return;
  }

  const { videoOk, audioOk } = await startRealMedia(local);

  // Allineiamo stato dei pulsanti:
  if (btnCam) {
    if (videoOk) {
      btnCam.classList.remove("off");
      btnCam.setAttribute("aria-pressed", "false");
    } else {
      btnCam.classList.add("off");
      btnCam.setAttribute("aria-pressed", "true");
    }
  }

  if (btnMute) {
    if (audioOk) {
      btnMute.classList.remove("off");
      btnMute.setAttribute("aria-pressed", "false");
    } else {
      btnMute.classList.add("off");
      btnMute.setAttribute("aria-pressed", "true");
    }
  }

  console.log("[Overlay] startOverlayVideoChat completed", { videoOk, audioOk });
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
