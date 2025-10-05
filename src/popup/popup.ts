const btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const btnConnect = document.getElementById("btn-connect") as HTMLButtonElement;
const taOffer = document.getElementById("offer") as HTMLTextAreaElement;
const statusDiv = document.getElementById("status")!;

btnCreate.addEventListener("click", async () => {
  // TODO: genera offerta SDP
  const offer = "dummy-offer";
  taOffer.value = JSON.stringify({ sdp: offer });
  statusDiv.textContent = "Offer generata";
});

btnConnect.addEventListener("click", async () => {
  const text = taOffer.value;
  try {
    const obj = JSON.parse(text);
    // TODO: set risposta / signaling
    statusDiv.textContent = "Connessione in corso…";
  } catch (err) {
    statusDiv.textContent = "Formato JSON non valido";
  }
});
