# Netflix Sync Extension

Estensione Chrome per sincronizzare la riproduzione di video Netflix e aggiungere una **mini videochat peer-to-peer**.  
Permette di sincronizzare play/pause/seek tra due utenti e vedere l’altra persona in un piccolo riquadro flottante.

---

## 📝 Funzionalità

- Sincronizzazione **play/pause/seek** tra due utenti.
- Videochat P2P con microfono e webcam in overlay.
- Peer-to-peer senza server esterni (solo STUN per NAT traversal).
- Overlay leggero, draggable, non invasivo.
- Compatibile con Chrome (Manifest V3).

---

## ⚡️ Tecnologie principali

- **Chrome Extension** (Manifest V3)
- **TypeScript**
- **Vite** (bundler e dev server)
- **WebRTC** (RTCPeerConnection + DataChannel)
- **getUserMedia** per webcam e microfono
- **STUN server** pubblico per NAT traversal (opzionale, consigliato)
- Modularizzazione in content script, popup e utils


