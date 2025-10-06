import "./popup.css";

const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
const taOffer = document.getElementById("offer") as HTMLTextAreaElement;
const taAnswer = document.getElementById("answer") as HTMLTextAreaElement;
const statusDiv = document.getElementById("status")!;



let pc: RTCPeerConnection;
let dataChannel: RTCDataChannel;

function setStatus(text: string) {
  console.log("[Popup] " + text);
  statusDiv.textContent = text;
}



/** Crea una nuova sessione (offerta SDP) */
btnCreate.addEventListener("click", async () => {
  try {
    pc = new RTCPeerConnection();
    dataChannel = pc.createDataChannel("sync");
    dataChannel.onopen = () => setStatus("Canale dati aperto");
    dataChannel.onmessage = (ev) => console.log("[DataChannel] RX:", ev.data);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 🔸 Mostra versione abbreviata solo per copia/incolla
    const sdpBase64 = btoa(JSON.stringify(offer));
    taOffer.value = sdpBase64;

    setStatus("Offerta pronta — copia e inviala all'altra persona");

  } catch (err) {
    console.error(err);
    setStatus("Errore durante la creazione dell'offerta");
  }
});



/** Collega un answer ricevuto (base64) */
btnConnect.addEventListener("click", async () => {
  try {
    if (!pc) {
      pc = new RTCPeerConnection();
      pc.ondatachannel = (ev) => {
        dataChannel = ev.channel;
        dataChannel.onopen = () => setStatus("✅ Connesso");
        dataChannel.onmessage = (ev) => console.log("[DataChannel] RX:", ev.data);
      };
    }

    const text = taAnswer.value.trim();
    if (!text) {
      setStatus("Incolla prima la risposta (answer)");
      return;
    }

    // 🔸 Decodifica base64 e applica
    const answer = JSON.parse(atob(text));
    await pc.setRemoteDescription(answer);

    setStatus("Connessione in corso…");

    pc.onconnectionstatechange = () => {
      setStatus("Stato: " + pc.connectionState);
      if (pc.connectionState === "connected") setStatus("🎬 Connessione P2P stabilita!");
    };

  } catch (err) {
    console.error(err);
    setStatus("Formato non valido o errore di connessione");
  }
});



/** Gestisce una offerta ricevuta (per l’altro peer) */
async function handleIncomingOffer(base64Offer: string) {
  try {
    const offer = JSON.parse(atob(base64Offer));
    pc = new RTCPeerConnection();

    pc.ondatachannel = (ev) => {
      dataChannel = ev.channel;
      dataChannel.onopen = () => setStatus("✅ Connesso");
      dataChannel.onmessage = (ev) => console.log("[DataChannel] RX:", ev.data);
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // 🔸 Mostra risposta in formato base64
    taAnswer.value = btoa(JSON.stringify(answer));
    setStatus("Answer generata — inviala all'altro peer");

  } catch (err) {
    console.error(err);
    setStatus("Errore nella gestione dell'offerta");
  }
}


(window as any).handleIncomingOffer = handleIncomingOffer;
