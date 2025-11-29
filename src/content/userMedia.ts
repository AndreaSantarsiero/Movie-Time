// Questo file gestisce tutta la parte media lato local peer:
// - stream fake (canvas nero + audio muto) necessario per la negoziazione iniziale
// - acquisizione media reali via getUserMedia
// - replaceTrack su RTCRtpSender video/audio
// - preview locale (video locale <video id="local">)
// - abilita/disabilita mic/cam su richiesta dell'overlay
//
// L'overlay si limita a:
// - chiamare initFakeLocalMedia() all'avvio
// - chiamare startRealMedia() quando la connessione WebRTC è stabilita
// - usare enable/disableCamera() e enable/disableAudio() sui click dei pulsanti
// - mostrare eventuali errori all'utente (alert o UI)


import { getSingletonRTC, setLocalStream } from "./webrtc";

type MediaToggleResult = "on" | "off" | "error";



// Stato condiviso fake / real
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

// Evita di rilanciare getUserMedia full startRealMedia più volte inutilmente
let __startRealMediaCalled = false;



/**
 * Trova e memorizza i sender video/audio della RTCPeerConnection singleton.
 */
function ensureSenders(): { video: RTCRtpSender | null; audio: RTCRtpSender | null } {
  const rtc = getSingletonRTC();
  if (!rtc || !rtc.pc) return { video: null, audio: null };

  if (!__videoSender || !__audioSender) {
    const senders = rtc.pc.getSenders();

    if (!__videoSender) {
      __videoSender = senders.find((s) => s.track && s.track.kind === "video") || null;
      if (!__videoSender) {
        console.warn("[UserMedia] No video RTCRtpSender found yet");
      }
    }
    if (!__audioSender) {
      __audioSender = senders.find((s) => s.track && s.track.kind === "audio") || null;
      if (!__audioSender) {
        console.warn("[UserMedia] No audio RTCRtpSender found yet");
      }
    }
  }

  return { video: __videoSender, audio: __audioSender };
}



/**
 * Costruisce uno stream di preview locale:
 * - videoTrack: fake o real
 * - audio: reale se presente, altrimenti fake se presente
 */
function buildLocalPreviewStream(videoTrack: MediaStreamTrack | null): MediaStream {
  const preview = new MediaStream();
  if (videoTrack) {
    preview.addTrack(videoTrack);
  }
  if (__realAudioTrack) {
    preview.addTrack(__realAudioTrack);
  } else if (__fakeAudioTrack) {
    preview.addTrack(__fakeAudioTrack);
  }
  return preview;
}



/**
 * Crea il MediaStream fake iniziale:
 * - video nero (canvas)
 * - audio muto (oscillatore con gain a 0)
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



/**
 * Inizializza lo stream locale fake:
 * - crea fake AV stream
 * - lo manda al core WebRTC (setLocalStream)
 * - imposta il preview del <video local>
 */
export function initFakeLocalMedia(localVideoEl: HTMLVideoElement): void {
  const fakeStream = createFakeAVStream();
  setLocalStream(fakeStream);
  localVideoEl.srcObject = buildLocalPreviewStream(__fakeVideoTrack || null);
}



/**
 * Avvio media reali "full" (video+audio) dopo che la connessione è stabilita.
 * - Chiama getUserMedia({ video: true, audio: true })
 * - replaceTrack sulle tracce fake, se esistono i sender
 * - aggiorna la preview locale
 *
 * Non mostra popup: eventuali errori vengono loggati e il chiamante
 * può decidere come reagire (tipicamente: lascia i pulsanti OFF).
 */
export async function startRealMedia(
  localVideoEl: HTMLVideoElement
): Promise<{ videoOk: boolean; audioOk: boolean }> {
  if (__startRealMediaCalled && (__realVideoTrack || __realAudioTrack)) {
    // Già chiamato e abbiamo già qualche traccia reale: restituiamo lo stato attuale
    return {
      videoOk: !!__realVideoTrack,
      audioOk: !!__realAudioTrack,
    };
  }

  __startRealMediaCalled = true;

  let videoOk = false;
  let audioOk = false;

  try {
    const real = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    __realStream = real;
    __realVideoTrack = real.getVideoTracks()[0] || null;
    __realAudioTrack = real.getAudioTracks()[0] || null;

    const { video, audio } = ensureSenders();

    if (video && __realVideoTrack) {
      try {
        await video.replaceTrack(__realVideoTrack);
        videoOk = true;
      } catch (err) {
        console.error("[UserMedia] replaceTrack (video real) failed:", err);
      }
    }

    if (audio && __realAudioTrack) {
      try {
        await audio.replaceTrack(__realAudioTrack);
        audioOk = true;
      } catch (err) {
        console.error("[UserMedia] replaceTrack (audio real) failed:", err);
      }
    }

    // Preview locale con tracce reali (o fallback fake se una manca)
    localVideoEl.srcObject = buildLocalPreviewStream(__realVideoTrack || __fakeVideoTrack || null);

    console.log(
      "[UserMedia] Real media started",
      { videoOk, audioOk }
    );

    return { videoOk, audioOk };
  } catch (err) {
    console.error("[UserMedia] Failed to acquire real media, staying on fake tracks:", err);
    // Lasciamo fake come sono, non modifichiamo la preview
    return { videoOk: false, audioOk: false };
  }
}



/**
 * Richiede / attiva la webcam reale:
 * - se riesce, sostituisce la traccia video fake con quella reale sui sender
 * - aggiorna la preview locale
 * - restituisce true se l'operazione va a buon fine, false altrimenti
 *
 * È pensata per essere chiamata quando l'utente preme il pulsante "cam ON".
 */
export async function enableCamera(localVideoEl: HTMLVideoElement): Promise<boolean> {
  const { video } = ensureSenders();
  if (!video) {
    console.warn("[UserMedia] enableCamera: no video sender yet");
    // Proviamo comunque a prendere la webcam: useremo la preview locale
  }

  try {
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const newVideoTrack = camStream.getVideoTracks()[0] || null;

    if (!newVideoTrack) {
      console.warn("[UserMedia] enableCamera: no video track from getUserMedia");
      camStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      return false;
    }

    // Ferma eventuale traccia reale precedente
    if (__realVideoTrack && __realVideoTrack !== newVideoTrack) {
      try {
        __realVideoTrack.stop();
      } catch {
        // ignore
      }
    }

    __realVideoTrack = newVideoTrack;

    if (video) {
      try {
        await video.replaceTrack(newVideoTrack);
      } catch (err) {
        console.error("[UserMedia] enableCamera: replaceTrack failed:", err);
      }
    }

    // Preview locale: video reale + audio reale o fake
    localVideoEl.srcObject = buildLocalPreviewStream(newVideoTrack);

    console.log("[UserMedia] Camera enabled");
    return true;
  } catch (err) {
    console.error("[UserMedia] enableCamera: getUserMedia failed", err);
    return false;
  }
}



/**
 * Disattiva la webcam reale:
 * - sostituisce la traccia video reale con quella fake (se esiste)
 * - stoppa la traccia reale (LED off)
 * - aggiorna la preview locale
 *
 * Non restituisce errori: se manca la fake track, semplicemente smette di mostrare video reale.
 */
export async function disableCamera(localVideoEl: HTMLVideoElement): Promise<void> {
  const { video } = ensureSenders();

  if (video && __fakeVideoTrack) {
    try {
      await video.replaceTrack(__fakeVideoTrack);
    } catch (err) {
      console.error("[UserMedia] disableCamera: replaceTrack to fake failed:", err);
    }
  }

  if (__realVideoTrack) {
    try {
      __realVideoTrack.stop();
    } catch {
      // ignore
    }
    __realVideoTrack = null;
  }

  // Preview: torna al video fake (più eventuale audio reale)
  localVideoEl.srcObject = buildLocalPreviewStream(__fakeVideoTrack || null);
  console.log("[UserMedia] Camera disabled");
}



/**
 * Attiva l'audio locale (se esiste una traccia audio reale).
 * - Se non c'è una realAudioTrack, ritorna false (per permettere all'overlay di mostrare un errore).
 * - Se c'è, abilita tutte le tracce audio nel preview e ritorna true.
 */
export function enableAudio(localVideoEl: HTMLVideoElement): boolean {
  if (!__realAudioTrack) {
    console.warn("[UserMedia] enableAudio: no real audio track available");
    return false;
  }

  const stream = localVideoEl.srcObject as MediaStream | null;
  if (!stream) {
    console.warn("[UserMedia] enableAudio: no local preview stream");
    return false;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.warn("[UserMedia] enableAudio: preview has no audio tracks");
    return false;
  }

  audioTracks.forEach((t) => {
    t.enabled = true;
  });

  console.log("[UserMedia] Audio enabled");
  return true;
}



/**
 * Disattiva l'audio locale (real o fake).
 * Non dà errori; se non ci sono tracce, non fa nulla.
 */
export function disableAudio(localVideoEl: HTMLVideoElement): void {
  const stream = localVideoEl.srcObject as MediaStream | null;
  if (!stream) return;

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;

  audioTracks.forEach((t) => {
    t.enabled = false;
  });

  console.log("[UserMedia] Audio disabled");
}



/**
 * Cleanup completo delle risorse locali:
 * - fake stream + AudioContext
 * - realStream + tracce reali
 * - reset di tutti i riferimenti
 */
export function cleanupUserMedia(): void {
  try {
    if (__fakeStream) {
      __fakeStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }

  if (__fakeAudioSourceNode && __fakeAudioContext) {
    try {
      (__fakeAudioSourceNode as any).stop?.();
    } catch {
      // ignore
    }
  }
  if (__fakeAudioContext) {
    try {
      __fakeAudioContext.close();
    } catch {
      // ignore
    }
  }

  try {
    if (__realStream) {
      __realStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }

  if (__realVideoTrack) {
    try {
      __realVideoTrack.stop();
    } catch {
      // ignore
    }
  }
  if (__realAudioTrack) {
    try {
      __realAudioTrack.stop();
    } catch {
      // ignore
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
  __startRealMediaCalled = false;

  console.log("[UserMedia] Cleanup done");
}
