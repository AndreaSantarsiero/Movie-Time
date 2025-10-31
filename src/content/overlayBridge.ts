function getPlayer() {
  const api = (window as any)?.netflix?.appContext?.state?.playerApp?.getAPI?.();
  return api?.videoPlayer?.getVideoPlayerBySessionId?.(
    api?.videoPlayer?.getAllPlayerSessionIds?.()?.[0]
  );
}



function getContentInfo() {
  // Netflix: /watch/<id>
  const m = location.pathname.match(/\/watch\/(\d+)/);
  const contentId = m?.[1] ?? null;

  const p = getPlayer();
  const duration = p?.getDuration?.() ?? null;

  // Titolo: prendiamo il <title> come fallback
  const title = document.title?.trim() || null;

  return { contentId, title, duration };
}



window.addEventListener("message", (ev) => {
  if (ev.data?.source !== "movie-time-content") return;
  const player = getPlayer();
  if (!player) return;

  if (ev.data.type === "PLAY") player.play();
  if (ev.data.type === "PAUSE") player.pause();
  if (ev.data.type === "SEEK") player.seek(ev.data.time);

  // smoothing rate control
  if (ev.data.type === "SET_RATE") {
    try {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      if (v) v.playbackRate = Number(ev.data.rate) || 1.0;
    } catch {}
  }
  if (ev.data.type === "CLEAR_RATE") {
    try {
      const v = document.querySelector("video") as HTMLVideoElement | null;
      if (v) v.playbackRate = 1.0;
    } catch {}
  }

  // handshake: la content script chiede le info del contenuto
  if (ev.data.type === "HELLO_REQUEST") {
    const info = getContentInfo();
    window.postMessage(
      { source: "movie-time-bridge", type: "HELLO_RESPONSE", info },
      "*"
    );
  }
});



// Heartbeat player → content (tempo/pausa)
setInterval(() => {
  const p = getPlayer();
  if (!p) return;
  window.postMessage(
    {
      source: "movie-time-bridge",
      type: "TICK",
      time: p.getCurrentTime(),
      paused: p.isPaused(),
    },
    "*"
  );
}, 500);
