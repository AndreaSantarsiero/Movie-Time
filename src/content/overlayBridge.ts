function getPlayer() {
  const api = (window as any)?.netflix?.appContext?.state?.playerApp?.getAPI?.();
  return api?.videoPlayer?.getVideoPlayerBySessionId?.(
    api?.videoPlayer?.getAllPlayerSessionIds?.()?.[0]
  );
}


function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video");
}



function getContentInfo() {
  // Netflix: /watch/<id>
  const match = location.pathname.match(/\/watch\/(\d+)/);
  const contentId = match?.[1] ?? null;

  const video = getVideoElement();
  const duration =
    video && Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : null;

  // Titolo: usiamo <title> come fallback
  const title = document.title?.trim() || null;

  return { contentId, title, duration };
}



window.addEventListener("message", (ev) => {
  const data = ev.data;
  if (!data || data.source !== "movie-time-content") return;

  const player = getPlayer();
  const video = getVideoElement();

  // Comandi di controllo playback usati dal protocollo di sync
  if (data.type === "PLAY") {
    if (player) {
      player.play();
    } else if (video) {
      video.play().catch((e) => console.warn("[Bridge] Video play failed", e));
    }
  }

  if (data.type === "PAUSE") {
    if (player) {
      player.pause();
    } else if (video) {
      video.pause();
    }
  }

  if (data.type === "SEEK") {
    const timeSec = Number(data.time) || 0;
    if (player) {
      player.seek(timeSec * 1000);
    } else if (video) {
      video.currentTime = timeSec;
    }
  }

  // Controllo playbackRate unificato sul <video>
  if (data.type === "SET_RATE") {
    try {
      if (video) video.playbackRate = Number(data.rate) || 1.0;
    } catch {
      // ignore
    }
  }

  if (data.type === "CLEAR_RATE") {
    try {
      if (video) video.playbackRate = 1.0;
    } catch {
      // ignore
    }
  }

  // Handshake iniziale: la content script chiede info sul contenuto
  if (data.type === "HELLO_REQUEST") {
    const info = getContentInfo();
    window.postMessage(
      { source: "movie-time-bridge", type: "HELLO_RESPONSE", info },
      "*"
    );
  }
});



// Heartbeat player → content (tempo/pausa)
// Usato da videoSync per:
//   - stimare la posizione locale corrente
//   - rilevare azioni manuali (play/pause/seek) dell’utente locale
setInterval(() => {
  const video = getVideoElement();
  if (!video) return;

  const timeSec =
    Number.isFinite(video.currentTime) && video.currentTime >= 0
      ? video.currentTime
      : 0;

  window.postMessage(
    {
      source: "movie-time-bridge",
      type: "TICK",
      time: timeSec,
      paused: video.paused,
    },
    "*"
  );
}, 500);
