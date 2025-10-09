import { testNatSymmetry, formatNatResult } from "../utils/natTest";


console.log("[Popup] Loaded");

const testBtn = document.getElementById("btn-test") as HTMLButtonElement;
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
  statusEl.innerText = "Ready";
};
(document.getElementById("choose-connect") as HTMLButtonElement).onclick = () => {
  document.getElementById("step-choice")!.style.display = "none";
  document.getElementById("step-join")!.style.display = "block";
  statusEl.innerText = "Ready";
};



testBtn.onclick = async () => {
  try {
    (statusEl).innerText = "🔎 Testing NAT via STUN…";
    const res = await testNatSymmetry();
    statusEl.innerText = formatNatResult(res);
  } catch (e: any) {
    statusEl.innerText = `❌ NAT test failed: ${e?.message ?? String(e)}`;
  }
};



createBtn.onclick = () => {
  console.log("[Popup] CREATE_SESSION sent");
  chrome.runtime.sendMessage({ type: "CREATE_SESSION" }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to create offer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] CREATE_SESSION resp:", res);
    if (res?.offer) {
      offerEl.value = JSON.stringify(res.offer);
      statusEl.innerText = "✅ Offer created. Copy and share it.";
    } else {
      statusEl.innerText = `❌ Failed to create offer: ${res?.error ?? "NO_RESPONSE"}`;
    }
  });
};


connectBtn.onclick = () => {
  const answer = answerEl.value.trim();
  if (!answer) return alert("Paste the answer first!");
  console.log("[Popup] APPLY_ANSWER sent");
  chrome.runtime.sendMessage({ type: "APPLY_ANSWER", answer }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to apply answer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] APPLY_ANSWER resp:", res);
    statusEl.innerText = res?.ok ? "✅ Connected!" : `❌ Failed to apply answer: ${res?.error ?? "NO_RESPONSE"}`;
  });
};


genAnswerBtn.onclick = () => {
  const offer = incomingOfferEl.value.trim();
  if (!offer) return alert("Paste the offer first!");
  console.log("[Popup] CONNECT_SESSION sent");
  chrome.runtime.sendMessage({ type: "CONNECT_SESSION", offer }, (res) => {
    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to generate answer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] CONNECT_SESSION resp:", res);
    if (res?.answer) {
      answerForPeerEl.value = JSON.stringify(res.answer);
      statusEl.innerText = "✅ Answer generated. Send it back.";
    } else {
      statusEl.innerText = `❌ Failed to generate answer: ${res?.error ?? "NO_RESPONSE"}`;
    }
  });
};



function encodeOfferForShare(obj: any): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  // Base64
  let b64 = btoa(String.fromCharCode(...bytes));
  // URL-safe (comodo per WhatsApp/Telegram)
  b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return b64;
}


function decodeOfferFromShare(b64url: string): any {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  // reintegra padding
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}
