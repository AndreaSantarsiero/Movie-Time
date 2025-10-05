import { setupVideoSync } from "./videoSync";
import { setupWebRTC } from "./webrtc";

console.log("Content script loaded");

// Inizializza sincronizzazione video
setupVideoSync();

// Inizializza WebRTC videochat (ma potresti attivarla solo dopo signaling)
setupWebRTC();
