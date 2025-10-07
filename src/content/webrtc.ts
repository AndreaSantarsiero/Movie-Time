let __rtcSingleton: RTCLink | null = null;
export const getSingletonRTC = () => __rtcSingleton;



export class RTCLink {

  pc!: RTCPeerConnection;
  dc!: RTCDataChannel;



  constructor() {
    if (__rtcSingleton) {
      console.log("[RTC] Reusing existing instance");
      return __rtcSingleton;
    }
    console.log("[RTC] Creating RTCPeerConnection");
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // DataChannel per signaling/sync
    this.dc = this.pc.createDataChannel("sync");
    this.dc.onopen = () => console.log("[RTC] DataChannel open");
    this.dc.onmessage = (e) => console.log("[RTC] DC message:", e.data);
    this.dc.onclose = () => console.log("[RTC] DataChannel closed");

    // Log stato connessione/ICE
    this.pc.onconnectionstatechange = () =>
      console.log("[RTC] ConnState:", this.pc.connectionState);
    this.pc.oniceconnectionstatechange = () =>
      console.log("[RTC] ICE State:", this.pc.iceConnectionState);
    this.pc.onicecandidate = (e) =>
      console.log("[RTC] ICE:", e.candidate ?? "gathering complete");

    __rtcSingleton = this;
  }



  async createOffer() {
    console.log("[RTC] createOffer() start");
    // NB: con solo DataChannel, createOffer funziona senza tracce media
    const offer = await this.pc.createOffer({}); // parametri vuoti OK
    console.log("[RTC] setLocalDescription(offer)...");
    await this.pc.setLocalDescription(offer);
    console.log("[RTC] Offer ready");
    return offer;
  }

  
  async applyRemote(desc: RTCSessionDescriptionInit) {
    console.log("[RTC] applyRemote:", desc?.type);
    await this.pc.setRemoteDescription(desc);
    if (desc.type === "offer") {
      console.log("[RTC] createAnswer()");
      const answer = await this.pc.createAnswer();
      console.log("[RTC] setLocalDescription(answer)...");
      await this.pc.setLocalDescription(answer);
      console.log("[RTC] Answer ready");
      return answer;
    }
  }
}
