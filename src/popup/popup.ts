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

const stepChoiceEl = document.getElementById("step-choice") as HTMLElement;
const stepCreateEl = document.getElementById("step-create") as HTMLElement;
const stepJoinEl = document.getElementById("step-join") as HTMLElement;

const backBtn = document.getElementById("btn-back") as HTMLButtonElement | null;

type ActiveStep = "choice" | "create" | "join";



// helper opzionale per classi CSS di stato NAT
function setNatStatusClass(outcome: "GREEN" | "YELLOW" | "RED" | "ERROR") {
  if (!statusEl) return;
  statusEl.classList.remove("nat-green", "nat-yellow", "nat-red", "nat-error");
  if (outcome === "GREEN") statusEl.classList.add("nat-green");
  else if (outcome === "YELLOW") statusEl.classList.add("nat-yellow");
  else if (outcome === "RED") statusEl.classList.add("nat-red");
  else statusEl.classList.add("nat-error");
}


function showStep(step: ActiveStep) {
  stepChoiceEl.style.display = step === "choice" ? "block" : "none";
  stepCreateEl.style.display = step === "create" ? "block" : "none";
  stepJoinEl.style.display = step === "join" ? "block" : "none";

  // mostra/nasconde il bottone "Back"
  if (backBtn) {
    backBtn.style.display = step === "choice" ? "none" : "inline-block";
  }

  // Persist step selection
  chrome.storage.local.set({ mt_activeStep: step });
}



// ---- Ripristino stato dal storage all'avvio del popup ----
chrome.storage.local.get(
  {
    mt_offer: "",
    mt_answer: "",
    mt_incomingOffer: "",
    mt_answerForPeer: "",
    mt_activeStep: "choice" as ActiveStep,
  },
  (data) => {
    offerEl.value = data.mt_offer;
    answerEl.value = data.mt_answer;
    incomingOfferEl.value = data.mt_incomingOffer;
    answerForPeerEl.value = data.mt_answerForPeer;

    showStep(data.mt_activeStep || "choice");
    statusEl.innerText = "Ready";
  }
);



// ---- Salva contenuto dei textarea su input ----
offerEl.addEventListener("input", () => {
  chrome.storage.local.set({ mt_offer: offerEl.value });
});

answerEl.addEventListener("input", () => {
  chrome.storage.local.set({ mt_answer: answerEl.value });
});

incomingOfferEl.addEventListener("input", () => {
  chrome.storage.local.set({ mt_incomingOffer: incomingOfferEl.value });
});

answerForPeerEl.addEventListener("input", () => {
  chrome.storage.local.set({ mt_answerForPeer: answerForPeerEl.value });
});



// ---- Selettori step ----
(document.getElementById("choose-create") as HTMLButtonElement).onclick = () => {
  showStep("create");
  statusEl.innerText = "Ready";
};

(document.getElementById("choose-connect") as HTMLButtonElement).onclick = () => {
  showStep("join");
  statusEl.innerText = "Ready";
};



// ---- Gestione callback pulsanti ----
if (backBtn) {
  backBtn.onclick = () => {
    showStep("choice");
    statusEl.innerText = "Ready";
    // non svuotiamo i campi: se l'utente torna per sbaglio, non perde ciò che ha scritto
  };
}


testBtn.onclick = async () => {
  try {
    statusEl.innerText = "🔎 Testing your network…";
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
  createBtn.disabled = true;
  statusEl.innerText = "⏳ Generating offer…";

  chrome.runtime.sendMessage({ type: "CREATE_SESSION" }, (res) => {
    createBtn.disabled = false;

    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to create offer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] CREATE_SESSION resp:", res);
    if (res?.offer) {
      const value = JSON.stringify(res.offer);
      offerEl.value = value;
      chrome.storage.local.set({ mt_offer: value });
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
  connectBtn.disabled = true;
  statusEl.innerText = "⏳ Connecting…";

  chrome.runtime.sendMessage({ type: "APPLY_ANSWER", answer }, (res) => {
    connectBtn.disabled = false;

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
  genAnswerBtn.disabled = true;
  statusEl.innerText = "⏳ Generating answer…";

  chrome.runtime.sendMessage({ type: "CONNECT_SESSION", offer }, (res) => {
    genAnswerBtn.disabled = false;

    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to generate answer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] CONNECT_SESSION resp:", res);
    if (res?.answer) {
      const value = JSON.stringify(res.answer);
      answerForPeerEl.value = value;
      chrome.storage.local.set({ mt_answerForPeer: value });
      statusEl.innerText = "✅ Answer generated. Send it back.";
    } else {
      statusEl.innerText = `❌ Failed to generate answer: ${res?.error ?? "NO_RESPONSE"}`;
    }
  });
};



// ---- Utility encoding/decoding ----
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
