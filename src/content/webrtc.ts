let __rtcSingleton: RTCLink | null = null;
export const getSingletonRTC = () => __rtcSingleton;

let _localStream: MediaStream | null = null;
let _remoteStreamCb: ((s: MediaStream) => void) | null = null;
let _lastRemoteStream: MediaStream | null = null;
let _waiters: Array<(ok: boolean) => void> = [];



/** Chiamato dall’overlay quando la webcam è pronta */
export function setLocalStream(stream: MediaStream) {
  _localStream = stream;
  // sveglia eventuali attese
  _waiters.splice(0).forEach((cb) => cb(true));
  // se la PC esiste già, attacca subito le tracce
  if (__rtcSingleton) __rtcSingleton.attachLocalStream(stream);
}



/** L’overlay si registra per ricevere il remote stream */
export function onRemoteStream(cb: (s: MediaStream) => void) {
  _remoteStreamCb = cb;
  // se è già arrivato prima, consegnalo subito (evita race su ontrack)
  if (_lastRemoteStream) _remoteStreamCb(_lastRemoteStream);
}



/** Facoltativo ma utile: attende la webcam prima di negoziare */
export function waitForLocalStream(timeoutMs = 10000): Promise<boolean> {
  if (_localStream) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // timeout: non bloccare all’infinito
      const i = _waiters.indexOf(resolver);
      if (i >= 0) _waiters.splice(i, 1);
      resolve(false);
    }, timeoutMs);
    const resolver = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    _waiters.push(resolver);
  });
}



type SyncMsg = any; // vedi videoSync.ts per il formato esatto
const __syncHandlers: Array<(m: SyncMsg) => void> = [];

export function onSyncMessage(cb: (m: SyncMsg) => void) {
  __syncHandlers.push(cb);
}

export function sendSync(payload: SyncMsg) {
  const link = getSingletonRTC();
  if (!link || !link.dc || link.dc.readyState !== "open") {
    console.warn("[RTC] sendSync(): datachannel not open");
    return;
  }
  try {
    // Tagghiamo il canale per filtrare eventuali altri payload
    link.dc.send(JSON.stringify({ __ch: "sync", ...payload }));
  } catch (e) {
    console.error("[RTC] sendSync() failed:", e);
  }
}




/** Stats utili per capire se i byte scorrono e quale coppia ICE è selezionata */
export async function getStatsSnapshot(pc: RTCPeerConnection) {
  const rep = await pc.getStats();
  let videoRecvBytes = 0, audioRecvBytes = 0, videoSendBytes = 0, audioSendBytes = 0;
  let selectedPair: any = null;

  rep.forEach((s) => {
    if (s.type === "inbound-rtp" && !s.isRemote) {
      // @ts-ignore
      if (s.kind === "video") videoRecvBytes += s.bytesReceived ?? 0;
      // @ts-ignore
      if (s.kind === "audio") audioRecvBytes += s.bytesReceived ?? 0;
    }
    if (s.type === "outbound-rtp" && !s.isRemote) {
      // @ts-ignore
      if (s.kind === "video") videoSendBytes += s.bytesSent ?? 0;
      // @ts-ignore
      if (s.kind === "audio") audioSendBytes += s.bytesSent ?? 0;
    }
    if (s.type === "transport" && (s as any).selectedCandidatePairId && rep.get((s as any).selectedCandidatePairId)) {
      selectedPair = rep.get((s as any).selectedCandidatePairId);
    }
  });
  return { videoRecvBytes, audioRecvBytes, videoSendBytes, audioSendBytes, selectedPair };
}



/** Logger periodico delle stats */
export function startStatsLogger(pc: RTCPeerConnection, label = "RTC") {
  let last = { vR:0, aR:0, vS:0, aS:0 };
  return setInterval(async () => {
    const s = await getStatsSnapshot(pc);
    const dvR = s.videoRecvBytes - last.vR;
    const daR = s.audioRecvBytes - last.aR;
    const dvS = s.videoSendBytes - last.vS;
    const daS = s.audioSendBytes - last.aS;
    last = { vR: s.videoRecvBytes, aR: s.audioRecvBytes, vS: s.videoSendBytes, aS: s.audioSendBytes };

    console.log(
      `[${label}] ΔBytes recv(v/a)=${dvR}/${daR} send(v/a)=${dvS}/${daS}`,
      "candPair:", s.selectedPair?.localCandidateId, "→", s.selectedPair?.remoteCandidateId
    );
  }, 2000);
}



/** Attende che l'ICE gathering finisca (o timeout) così l’SDP locale contiene TUTTI i candidati */
async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 8000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      console.warn("[RTC] ICE gathering timed out");
      resolve(); // non bloccare all’infinito: useremo ciò che abbiamo
    }, timeoutMs);
    const onchg = () => {
      console.log("[RTC] icegatheringstate:", pc.iceGatheringState);
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        pc.removeEventListener("icegatheringstatechange", onchg);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onchg);
  });
}



export class RTCLink {

  pc!: RTCPeerConnection;
  dc!: RTCDataChannel;
  private localTracksAdded = false;
  private appliedAnswer = false;



  constructor() {
    if (__rtcSingleton) {
      console.log("[RTC] Reusing existing instance");
      return __rtcSingleton;
    }

    console.log("[RTC] Creating RTCPeerConnection");
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // Se hai un TURN, aggiungilo qui (consigliato per hotspot / NAT simmetrici):
        // {
        //   urls: "turn:YOUR_TURN_HOST:3478",
        //   username: "user",
        //   credential: "pass",
        // },
      ],
      // Per test puoi forzare il relay:
      // iceTransportPolicy: "relay",
    });


    // DataChannel per sync (se lo usi)
    this.dc = this.pc.createDataChannel("sync");
    this.dc.onopen = () => console.log("[RTC] DataChannel open");
    this.dc.onmessage = (e) => {
      try {
        const obj = JSON.parse(e.data);
        if (obj?.__ch === "sync" || obj?.type) {
          __syncHandlers.forEach((fn) => fn(obj));
        } else {
          console.log("[RTC] DC (non-sync) message:", obj);
        }
      } catch {
        console.log("[RTC] DC (text) message:", e.data);
      }
    };
    this.dc.onclose = () => console.log("[RTC] DataChannel closed");

    
    // Log stati
    startStatsLogger(this.pc, "RTC");
    this.pc.onconnectionstatechange = () =>
      console.log("[RTC] ConnState:", this.pc.connectionState);
    this.pc.oniceconnectionstatechange = () =>
      console.log("[RTC] ICE State:", this.pc.iceConnectionState);
    this.pc.onicecandidate = (e) =>
      console.log("[RTC] ICE:", e.candidate ?? "gathering complete");
    this.pc.onicegatheringstatechange = () =>
      console.log("[RTC] ICE Gathering:", this.pc.iceGatheringState);

    // Remote media
    this.pc.ontrack = (ev) => {
      const stream = ev.streams?.[0];
      console.log("[RTC] ontrack, streams:", ev.streams?.length);
      if (stream) {
        _lastRemoteStream = stream;
        _remoteStreamCb?.(stream);
      }
    };

    // Se la webcam è già pronta, attacca subito le tracce
    if (_localStream) this.attachLocalStream(_localStream);

    __rtcSingleton = this;
  }



  attachLocalStream(stream: MediaStream) {
    if (this.localTracksAdded) return;
    console.log("[RTC] Attaching local tracks");
    stream.getTracks().forEach((t) => this.pc.addTrack(t, stream));
    this.localTracksAdded = true;
  }

  

  // Crea un'offer, imposta la localDescription e ASPETTA che l’ICE gathering finisca.
  // Ritorna SEMPRE la localDescription completa (con a=candidate) per il flusso copia-incolla.
  async createOffer() {
    if (!_localStream) console.warn("[RTC] createOffer() without local stream - l'SDP potrebbe non contenere A/V");
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    await waitForIceGathering(this.pc); // Vanilla ICE on
    const full = this.pc.localDescription!;
    console.log("[RTC] Offer ready with ICE, m-lines:", full?.sdp?.match(/^m=.*$/gm));
    return full;
  }



  // Applica una remote (offer|answer). Se è un'offer, genera l'answer e ASPETTA ICE.
  // Se è una answer, la applica una sola volta (evita duplicati).
  async applyRemote(desc: RTCSessionDescriptionInit) {
    console.log("[RTC] applyRemote:", desc?.type);
    await this.pc.setRemoteDescription(desc);

    if (desc.type === "offer") {
      if (!_localStream) console.warn("[RTC] Answer senza local stream - l'SDP potrebbe non contenere A/V");
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await waitForIceGathering(this.pc); // Vanilla ICE on
      const full = this.pc.localDescription!;
      console.log("[RTC] Answer ready with ICE");
      return full;
    }

    if (desc.type === "answer") {
      if (this.appliedAnswer) {
        console.warn("[RTC] Duplicate ANSWER ignored");
        return;
      }
      this.appliedAnswer = true;
      // nessun return: l’ICE proseguirà e ontrack arriverà appena c’è connettività
    }
  }
}
