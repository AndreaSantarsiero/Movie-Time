console.log("[Popup] Loaded");

const createBtn = document.getElementById("btn-create") as HTMLButtonElement;
const connectBtn = document.getElementById("btn-connect") as HTMLButtonElement;
const genAnswerBtn = document.getElementById("btn-generate-answer") as HTMLButtonElement;

const offerEl = document.getElementById("offer") as HTMLTextAreaElement;
const answerEl = document.getElementById("answer") as HTMLTextAreaElement;
const incomingOfferEl = document.getElementById("incoming-offer") as HTMLTextAreaElement;
const answerForPeerEl = document.getElementById("answer-for-peer") as HTMLTextAreaElement;
const statusEl = document.getElementById("status") as HTMLElement;



(document.getElementById("choose-create") as HTMLButtonElement).onclick = () => {
  document.getElementById("step-choice")!.style.display = "none";
  document.getElementById("step-create")!.style.display = "block";
};
(document.getElementById("choose-connect") as HTMLButtonElement).onclick = () => {
  document.getElementById("step-choice")!.style.display = "none";
  document.getElementById("step-join")!.style.display = "block";
};



createBtn.onclick = () => {
  console.log("[Popup] CREATE_SESSION sent");
  chrome.runtime.sendMessage({ type: "CREATE_SESSION" }, (res) => {
    console.log("[Popup] CREATE_SESSION resp:", res);
    if (res?.offer) {
      offerEl.value = JSON.stringify(res.offer);
      statusEl.innerText = "✅ Offer created. Copy and share it.";
    } else {
      statusEl.innerText = `❌ Failed to create offer: ${res?.error ?? "unknown"}`;
    }
  });
};



connectBtn.onclick = () => {
  const answer = answerEl.value.trim();
  if (!answer) return alert("Paste the answer first!");
  console.log("[Popup] APPLY_ANSWER sent");
  chrome.runtime.sendMessage({ type: "APPLY_ANSWER", answer }, (res) => {
    console.log("[Popup] APPLY_ANSWER resp:", res);
    statusEl.innerText = res?.ok ? "🔗 Answer applied" : `❌ ${res?.error ?? "apply failed"}`;
  });
};



genAnswerBtn.onclick = () => {
  const offer = incomingOfferEl.value.trim();
  if (!offer) return alert("Paste the offer first!");
  console.log("[Popup] CONNECT_SESSION sent");
  chrome.runtime.sendMessage({ type: "CONNECT_SESSION", offer }, (res) => {
    console.log("[Popup] CONNECT_SESSION resp:", res);
    if (res?.answer) {
      answerForPeerEl.value = JSON.stringify(res.answer);
      statusEl.innerText = "✅ Answer generated. Send it back.";
    } else {
      statusEl.innerText = `❌ Failed to generate answer: ${res?.error ?? "unknown"}`;
    }
  });
};
