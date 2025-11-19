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

  // Comandi di controllo playback usati dal protocollo di sync
  if (data.type === "PLAY" && player) {
    player.play();
  }

  if (data.type === "PAUSE" && player) {
    player.pause();
  }

  if (data.type === "SEEK" && player) {
    // data.time è in secondi → converti in ms per Netflix
    const timeSec = Number(data.time) || 0;
    player.seek(timeSec * 1000);
  }

  // Controllo playbackRate unificato sul <video>
  if (data.type === "SET_RATE") {
    try {
      const v = getVideoElement();
      if (v) v.playbackRate = Number(data.rate) || 1.0;
    } catch {
      // ignore
    }
  }

  if (data.type === "CLEAR_RATE") {
    try {
      const v = getVideoElement();
      if (v) v.playbackRate = 1.0;
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
