function getPlayer() {
  const api = (window as any)?.netflix?.appContext?.state?.playerApp?.getAPI?.();
  return api?.videoPlayer?.getVideoPlayerBySessionId?.(
    api?.videoPlayer?.getAllPlayerSessionIds?.()?.[0]
  );
}


window.addEventListener("message", (ev) => {
  if (ev.data?.source !== "movie-time-content") return;
  const player = getPlayer();
  if (!player) return;

  if (ev.data.type === "PLAY") player.play();
  if (ev.data.type === "PAUSE") player.pause();
  if (ev.data.type === "SEEK") player.seek(ev.data.time);
});


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
