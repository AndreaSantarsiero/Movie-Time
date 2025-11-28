// - Gestisce RTCPeerConnection (solo STUN).
// - Espone metodi per signaling (createOffer/applyRemote).
// - Espone setLocalStream/onRemoteStream per A/V.
// - Espone canale dati "sync" + helper sendSync/onSyncMessage.
//

type SyncHandler = (msg: any) => void;

let __rtcSingleton: RTCLink | null = null;

let _localStream: MediaStream | null = null;
let _remoteStreamCb: ((s: MediaStream) => void) | null = null;
let _lastRemoteStream: MediaStream | null = null;
const _waiters: Array<(ok: boolean) => void> = [];

const __syncHandlers: SyncHandler[] = [];



// --- API per il canale di sync ---
export function onSyncMessage(fn: SyncHandler) {
  if (typeof fn === "function") __syncHandlers.push(fn);
}


/** Chiamato dall’overlay quando la webcam è pronta */
export function setLocalStream(stream: MediaStream) {
  _localStream = stream;
  // sveglia eventuali attese
  _waiters.splice(0).forEach((cb) => cb(true));
  // se la PC esiste già, attacca subito le tracce
  if (__rtcSingleton && _localStream) {
    _localStream.getTracks().forEach((t) => {
      try {
        __rtcSingleton!.pc.addTrack(t, _localStream as MediaStream);
      } catch {
        // ignore
      }
    });
  }
}


/** Attende la disponibilità della webcam */
export function waitForLocalStream(timeoutMs = 10000): Promise<boolean> {
  if (_localStream) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(false), timeoutMs);
    _waiters.push((ok) => {
      clearTimeout(t);
      resolve(ok);
    });
  });
}


/** Registra callback per lo stream remoto */
export function onRemoteStream(cb: (s: MediaStream) => void) {
  _remoteStreamCb = cb;
  if (_lastRemoteStream) cb(_lastRemoteStream);
}


/** Accesso al singleton RTCLink (se già creato) */
export function getSingletonRTC() {
  return __rtcSingleton;
}


/** Helper di invio sul DataChannel "sync" */
export function sendSync(payload: any) {
  const rtc = __rtcSingleton;
  if (!rtc || !rtc.dc || rtc.dc.readyState !== "open") return;

  const obj = { __ch: "sync", ...payload };

  try {
    rtc.dc.send(JSON.stringify(obj));
  } catch (e) {
    console.warn("[RTC] Failed to send on DC:", e);
  }
}




// --- Implementazione RTCPeerConnection / DataChannel ---
export class RTCLink {

  public pc: RTCPeerConnection;
  public dc: RTCDataChannel | null = null;

  private appliedOffer = false;
  private appliedAnswer = false;

  private remoteStream: MediaStream;


  constructor() {
    // Crea singleton
    __rtcSingleton = this;

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    });

    this.remoteStream = new MediaStream();

    // Media: in arrivo
    this.pc.ontrack = (ev) => {
      if (ev.streams && ev.streams[0]) {
        this.remoteStream = ev.streams[0];
      } else {
        this.remoteStream.addTrack(ev.track);
      }
      _lastRemoteStream = this.remoteStream;
      if (_remoteStreamCb) _remoteStreamCb(this.remoteStream);
    };

    // Media: in uscita
    if (_localStream) {
      _localStream
        .getTracks()
        .forEach((t) => this.pc.addTrack(t, _localStream as MediaStream));
    }

    // ICE logging (facoltativo)
    this.pc.oniceconnectionstatechange = () => {
      console.log("[RTC] ICE state:", this.pc.iceConnectionState);
    };

    // DataChannel lato callee
    this.pc.ondatachannel = (ev) => {
      if (ev.channel.label === "sync") {
        this.attachDc(ev.channel);
      } else {
        console.log("[RTC] Unknown data channel:", ev.channel.label);
      }
    };
  }


  private attachDc(dc: RTCDataChannel) {
    this.dc = dc;
    this.dc.onopen = () => console.log("[RTC] DataChannel 'sync' open");
    this.dc.onclose = () => console.log("[RTC] DataChannel 'sync' close");
    this.dc.onerror = (e) => console.error("[RTC] DataChannel error", e);
    this.dc.onmessage = (e) => {
      try {
        const obj = JSON.parse(e.data);
        if (!obj || obj.__ch !== "sync") {
          console.log("[RTC] DC message (ignored non-sync):", obj);
          return;
        }
        __syncHandlers.forEach((fn) => {
          try {
            fn(obj);
          } catch (err) {
            console.error("[RTC] sync handler error", err);
          }
        });
      } catch {
        console.log("[RTC] DC (text) message:", e.data);
      }
    };
  }


  /** Crea un'offerta e apre il DataChannel "sync" lato caller */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    // DC lato caller
    if (!this.dc) {
      const dc = this.pc.createDataChannel("sync");
      this.attachDc(dc);
    }

    // Assicura tracce locali presenti (se disponibili al momento)
    if (_localStream) {
      _localStream.getTracks().forEach((t) => {
        try {
          this.pc.addTrack(t, _localStream as MediaStream);
        } catch {
          // ignore doppie addTrack
        }
      });
    }

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    } as any);
    await this.pc.setLocalDescription(offer);

    // Attendi ICE gathering completo per SDP più compatto (facoltativo)
    await new Promise<void>((res) => {
      if (this.pc.iceGatheringState === "complete") return res();
      const onState = () => {
        if (this.pc.iceGatheringState === "complete") {
          this.pc.removeEventListener("icegatheringstatechange", onState as any);
          res();
        }
      };
      this.pc.addEventListener("icegatheringstatechange", onState as any);
      // timeout di sicurezza
      setTimeout(() => res(), 1500);
    });

    return this.pc.localDescription as RTCSessionDescriptionInit;
  }


  /** Applica un SDP remoto. Se è un'offerta, restituisce l'answer. */
  async applyRemote(
    desc: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit | void> {
    if (!desc || !desc.type) throw new Error("Invalid remote description");

    if (desc.type === "offer") {
      if (this.appliedOffer) {
        console.warn("[RTC] Duplicate OFFER ignored");
      } else {
        await this.pc.setRemoteDescription(desc);
        this.appliedOffer = true;
      }

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Attendi ICE gathering (facoltativo)
      await new Promise<void>((res) => {
        if (this.pc.iceGatheringState === "complete") return res();
        const onState = () => {
          if (this.pc.iceGatheringState === "complete") {
            this.pc.removeEventListener("icegatheringstatechange", onState as any);
            res();
          }
        };
        this.pc.addEventListener("icegatheringstatechange", onState as any);
        setTimeout(() => res(), 1500);
      });

      return this.pc.localDescription as RTCSessionDescriptionInit;
    } else {
      // answer
      if (this.appliedAnswer) {
        console.warn("[RTC] Duplicate ANSWER ignored");
        return;
      }
      await this.pc.setRemoteDescription(desc);
      this.appliedAnswer = true;
    }
  }
}



/** Factory singleton */
export function ensureRTC(): RTCLink {
  if (!__rtcSingleton) __rtcSingleton = new RTCLink();
  return __rtcSingleton;
}
