function getMatchingPlayer(targetVideo: HTMLVideoElement | null) {
  if (!targetVideo) return null;

  const api = (window as any)?.netflix?.appContext?.state?.playerApp?.getAPI?.();
  if (!api || !api.videoPlayer) return null;

  const sessionIds = api.videoPlayer.getAllPlayerSessionIds?.() || [];

  // Iterate all sessions to find one matching the target video duration
  for (const id of sessionIds) {
    const p = api.videoPlayer.getVideoPlayerBySessionId(id);
    if (!p) continue;

    const durMs = p.getDuration();
    if (!Number.isFinite(durMs)) continue;

    // Check if durations match (within 2s tolerance to be safe)
    if (Math.abs(durMs - targetVideo.duration * 1000) < 2000) {
      return p;
    }
  }

  return null;
}



function getVideoElement(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video"));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  // Scoring system to find the "Main" video
  let bestVideo: HTMLVideoElement | null = null;
  let bestScore = -1;

  for (const v of videos) {
    if (!v.isConnected) continue;
    // Must have a source
    if (!v.src && !v.currentSrc) continue;

    let score = 0;

    // 1. Dimensions (Max 50)
    // Area relative to viewport
    const viewportArea = window.innerWidth * window.innerHeight;
    const rect = v.getBoundingClientRect();
    const videoArea = rect.width * rect.height;
    if (videoArea > 0 && viewportArea > 0) {
      const coverage = videoArea / viewportArea;
      // Cap at 50pts for > 50% coverage
      score += Math.min(50, coverage * 100);
    }

    // 2. Duration (Max 30)
    // Prefer long videos (movies) over short ones (trailers/previews)
    const dur = v.duration;
    if (isFinite(dur) && dur > 0) {
      if (dur > 600) score += 30;
      else if (dur > 120) score += 15;
      else if (dur > 30) score += 5;
    }

    // 3. Audio (Max 10)
    // Unmuted usually means user intent
    if (!v.muted && v.volume > 0) {
      score += 10;
    }

    // 4. Activity (Max 10)
    if (!v.paused) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVideo = v;
    }
  }

  return bestVideo;
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

  const video = getVideoElement();
  const player = getMatchingPlayer(video);

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

  const durationSec =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;

  window.postMessage(
    {
      source: "movie-time-bridge",
      type: "TICK",
      time: timeSec,
      paused: video.paused,
      duration: durationSec
    },
    "*"
  );
}, 500);
