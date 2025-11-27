import { runNatSelfTest, formatNatPopupSummary } from "../utils/natTest";


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


// helper opzionale per classi CSS di stato NAT
function setNatStatusClass(outcome: "GREEN" | "YELLOW" | "RED" | "ERROR") {
  if (!statusEl) return;
  statusEl.classList.remove("nat-green", "nat-yellow", "nat-red", "nat-error");
  if (outcome === "GREEN") statusEl.classList.add("nat-green");
  else if (outcome === "YELLOW") statusEl.classList.add("nat-yellow");
  else if (outcome === "RED") statusEl.classList.add("nat-red");
  else statusEl.classList.add("nat-error");
}

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
    statusEl.innerText = "🔎 Testing your network (NAT + STUN)…";
    setNatStatusClass("ERROR"); // stato neutro/grigio durante il test

    const result = await runNatSelfTest();
    const summary = formatNatPopupSummary(result);

    let emoji = "⚪";
    if (result.outcome === "GREEN") emoji = "🟢";
    else if (result.outcome === "YELLOW") emoji = "🟡";
    else if (result.outcome === "RED") emoji = "🔴";

    // Aggiorna testo e classe
    statusEl.innerText = `${emoji} ${summary.label}\n${summary.description}`;
    setNatStatusClass(result.outcome);
    console.log("[Popup] NAT self-test result:", result);
  } catch (e: any) {
    console.error("[Popup] NAT self-test failed", e);
    statusEl.innerText = `❌ NAT test failed: ${e?.message ?? String(e)}`;
    setNatStatusClass("ERROR");
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
    statusEl.innerText = res?.ok
      ? "✅ Connected!"
      : `❌ Failed to apply answer: ${res?.error ?? "NO_RESPONSE"}`;
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
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}
