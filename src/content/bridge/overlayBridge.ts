import { ProviderManager } from "./ProviderManager";



console.log("[Bridge] initializing...");
const providerManager = new ProviderManager();



window.addEventListener("message", (ev) => {
  const data = ev.data;
  if (!data || data.source !== "movie-time-content") return;

  const provider = providerManager.getProvider();

  // Comandi di controllo playback
  if (data.type === "PLAY") {
    provider.play();
  }

  if (data.type === "PAUSE") {
    provider.pause();
  }

  if (data.type === "SEEK") {
    const timeSec = Number(data.time) || 0;
    provider.seek(timeSec);
  }

  if (data.type === "SET_RATE") {
    const rate = Number(data.rate) || 1.0;
    provider.setPlaybackRate(rate);
  }

  if (data.type === "CLEAR_RATE") {
    provider.setPlaybackRate(1.0);
  }

  // Handshake iniziale: la content script chiede info sul contenuto
  if (data.type === "HELLO_REQUEST") {
    const info = provider.getContentInfo();
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
  const provider = providerManager.getProvider();

  // Some providers might not be ready (e.g. video not loaded yet)
  // We can still try to get info.

  const timeSec = provider.getTime();
  const durationSec = provider.getDuration();
  const paused = provider.isPaused();

  window.postMessage(
    {
      source: "movie-time-bridge",
      type: "TICK",
      time: timeSec,
      paused: paused,
      duration: durationSec,
      isAd: provider.isAdPlaying()
    },
    "*"
  );
}, 500);



console.log("[Bridge] initialized. Active provider:", providerManager.getProvider().name);
