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

const copyOfferBtn = document.getElementById("btn-copy-offer") as HTMLButtonElement | null;
const pasteAnswerBtn = document.getElementById("btn-paste-answer") as HTMLButtonElement | null;
const pasteIncomingOfferBtn = document.getElementById("btn-paste-incoming-offer") as HTMLButtonElement | null;
const copyAnswerForPeerBtn = document.getElementById("btn-copy-answer-for-peer") as HTMLButtonElement | null;

type ActiveStep = "choice" | "create" | "join";

type SignalingContext = "create-offer" | "apply-answer" | "generate-answer";

type PopupStorageState = {
  mt_offer: string;
  mt_answer: string;
  mt_incomingOffer: string;
  mt_answerForPeer: string;
  mt_activeStep: ActiveStep;
};



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


// Mostra gli errori di signaling in un popup (alert) con messaggi user-friendly
function handleSignalingError(context: SignalingContext, res: any) {
  const rawError = res?.error;
  const hint = typeof res?.hint === "string" ? res.hint : undefined;

  console.warn("[Popup] Signaling error:", { context, rawError, hint });

  let baseMessage: string;
  if (context === "create-offer") {
    baseMessage = "Failed to create offer.";
  } else if (context === "apply-answer") {
    baseMessage = "Failed to apply answer.";
  } else {
    baseMessage = "Failed to generate answer.";
  }

  const detail = hint ?? "Please make sure you have a single Netflix tab open on the title you want to sync, then try again.";
  const fullMessage = `${baseMessage}\n${detail}`;

  alert(`❌ ${fullMessage}`);
  statusEl.innerText = `❌ ${baseMessage}`;
}



// ---- Reset locale quando arriva RESET_STATE (da content/background) ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RESET_STATE") {
    console.log("[Popup] RESET_STATE received → clearing local state");

    offerEl.value = "";
    answerEl.value = "";
    incomingOfferEl.value = "";
    answerForPeerEl.value = "";
    statusEl.innerText = "Ready";

    showStep("choice");

    chrome.storage.local.remove([
      "mt_offer",
      "mt_answer",
      "mt_incomingOffer",
      "mt_answerForPeer",
      "mt_activeStep",
    ]);
  }
});



// ---- Ripristino stato dal storage all'avvio del popup ----
chrome.storage.local.get(
  {
    mt_offer: "",
    mt_answer: "",
    mt_incomingOffer: "",
    mt_answerForPeer: "",
    mt_activeStep: "choice" as ActiveStep,
  },
  (raw) => {
    const data = raw as PopupStorageState;

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



// ---- Back button ----
if (backBtn) {
  backBtn.onclick = () => {
    showStep("choice");
    statusEl.innerText = "Ready";
    // non svuotiamo i campi: se l'utente torna per sbaglio, non perde ciò che ha scritto
  };
}



// ---- NAT test ----
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



// ---- Offer / Answer buttons ----
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
      // Mostra all'utente una versione offuscata (base64 URL-safe)
      const encoded = encodeOfferForShare(res.offer);
      offerEl.value = encoded;
      chrome.storage.local.set({ mt_offer: encoded });
      statusEl.innerText = "✅ Offer created. Copy and share it.";
    } else {
      handleSignalingError("create-offer", res);
    }
  });
};


connectBtn.onclick = () => {
  const raw = answerEl.value.trim();
  if (!raw) return alert("Paste the answer first!");

  // Prova a decodificare l'answer (formato offuscato).
  // Se fallisce, usa la stringa così com'è (compatibilità con JSON puro).
  let answerPayload: string = raw;
  try {
    const obj = decodeOfferFromShare(raw);
    answerPayload = JSON.stringify(obj);
  } catch {
    // non è nel formato codificato, probabilmente JSON puro
  }

  console.log("[Popup] APPLY_ANSWER sent");
  connectBtn.disabled = true;
  statusEl.innerText = "⏳ Connecting…";

  chrome.runtime.sendMessage({ type: "APPLY_ANSWER", answer: answerPayload }, (res) => {
    connectBtn.disabled = false;

    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to apply answer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] APPLY_ANSWER resp:", res);
    if (res?.ok) {
      statusEl.innerText = "✅ Connected!";
    } else {
      handleSignalingError("apply-answer", res);
    }
  });
};


genAnswerBtn.onclick = () => {
  const raw = incomingOfferEl.value.trim();
  if (!raw) return alert("Paste the offer first!");

  // Prova a decodificare l'answer (formato offuscato).
  // Se fallisce, usa la stringa così com'è (compatibilità con JSON puro).
  let offerPayload: string = raw;
  try {
    const obj = decodeOfferFromShare(raw);
    offerPayload = JSON.stringify(obj);
  } catch {
    // non è nel formato codificato, probabilmente JSON puro
  }

  console.log("[Popup] CONNECT_SESSION sent");
  genAnswerBtn.disabled = true;
  statusEl.innerText = "⏳ Generating answer…";

  chrome.runtime.sendMessage({ type: "CONNECT_SESSION", offer: offerPayload }, (res) => {
    genAnswerBtn.disabled = false;

    if (chrome.runtime.lastError) {
      statusEl.innerText = `❌ Failed to generate answer: ${chrome.runtime.lastError.message}`;
      return;
    }
    console.log("[Popup] CONNECT_SESSION resp:", res);
    if (res?.answer) {
      // Mostra all'utente una versione offuscata dell'answer
      const encoded = encodeOfferForShare(res.answer);
      answerForPeerEl.value = encoded;
      chrome.storage.local.set({ mt_answerForPeer: encoded });
      statusEl.innerText = "✅ Answer generated. Send it back.";
    } else {
      handleSignalingError("generate-answer", res);
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



// ---- Clipboard helpers + wiring mini buttons ----
async function copyToClipboard(text: string) {
  if (!navigator.clipboard) {
    console.warn("[Popup] Clipboard API not available");
    statusEl.innerText = "❌ Clipboard API not available in this context.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    statusEl.innerText = "✅ Copied to clipboard.";
  } catch (err) {
    console.error("[Popup] Failed to copy to clipboard", err);
    statusEl.innerText = "❌ Failed to copy to clipboard.";
  }
}

async function pasteFromClipboard(): Promise<string | null> {
  if (!navigator.clipboard) {
    console.warn("[Popup] Clipboard API not available");
    statusEl.innerText = "❌ Clipboard API not available in this context.";
    return null;
  }
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (err) {
    console.error("[Popup] Failed to read from clipboard", err);
    statusEl.innerText = "❌ Failed to read from clipboard.";
    return null;
  }
}

// Step "Create" – copy Offer, paste Answer
if (copyOfferBtn) {
  copyOfferBtn.onclick = () => {
    const value = offerEl.value.trim();
    if (!value) {
      statusEl.innerText = "Nothing to copy yet.";
      return;
    }
    copyToClipboard(value);
  };
}

if (pasteAnswerBtn) {
  pasteAnswerBtn.onclick = async () => {
    const text = await pasteFromClipboard();
    if (text == null) return;
    answerEl.value = text;
    chrome.storage.local.set({ mt_answer: text });
    statusEl.innerText = "✅ Answer pasted from clipboard.";
  };
}

// Step "Join" – paste incoming Offer, copy Answer for peer
if (pasteIncomingOfferBtn) {
  pasteIncomingOfferBtn.onclick = async () => {
    const text = await pasteFromClipboard();
    if (text == null) return;
    incomingOfferEl.value = text;
    chrome.storage.local.set({ mt_incomingOffer: text });
    statusEl.innerText = "✅ Offer pasted from clipboard.";
  };
}

if (copyAnswerForPeerBtn) {
  copyAnswerForPeerBtn.onclick = () => {
    const value = answerForPeerEl.value.trim();
    if (!value) {
      statusEl.innerText = "Nothing to copy yet.";
      return;
    }
    copyToClipboard(value);
  };
}
