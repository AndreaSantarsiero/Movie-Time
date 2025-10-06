let pc: RTCPeerConnection;
let dataChannel: RTCDataChannel;
let localStream: MediaStream;



export function setupWebRTC() {
  console.log("[WebRTC] Ready");
}

export function getDataChannel() {
  return dataChannel;
}



export async function createOffer(): Promise<string> {
  pc = new RTCPeerConnection();
  dataChannel = pc.createDataChannel("sync");

  // quando ricevi messaggi (sync remoto)
  dataChannel.onmessage = (ev) => {
    console.log("DataChannel message:", ev.data);
  };

  // mostra video remoto
  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    attachRemoteVideo(stream);
  };

  // crea local stream webcam
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return JSON.stringify(offer);
}



export async function acceptAnswer(answerString: string) {
  const answer = JSON.parse(answerString);
  await pc.setRemoteDescription(answer);
  console.log("[WebRTC] Connection established");
}



export async function receiveOffer(offerString: string): Promise<string> {
  pc = new RTCPeerConnection();

  pc.ondatachannel = (ev) => {
    dataChannel = ev.channel;
    dataChannel.onmessage = (ev) => console.log("Received:", ev.data);
  };

  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    attachRemoteVideo(stream);
  };

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const offer = JSON.parse(offerString);
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  return JSON.stringify(answer);
}



function attachRemoteVideo(stream: MediaStream) {
  let el = document.getElementById("remote-video") as HTMLVideoElement;
  if (!el) {
    el = document.createElement("video");
    el.id = "remote-video";
    el.autoplay = true;
    el.style.position = "fixed";
    el.style.bottom = "10px";
    el.style.right = "10px";
    el.style.width = "200px";
    el.style.height = "150px";
    el.style.borderRadius = "12px";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  el.srcObject = stream;
}

