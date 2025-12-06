// Layer full-screen per mostrare "reazioni" emoji che fluttuano
// dal basso verso l'alto con lieve oscillazione e zoom.


// ID fissi per layer e <style>
const LAYER_ID = "movie-time-emoji-layer";
const STYLE_ID = "movie-time-emoji-style";

// Stato interno
let _initialized = false;
let _visible = true;



/**
 * Inizializza il sistema di emoji reactions.
 * - Crea (se necessario) il layer full-screen.
 * - Inietta lo <style> con le animazioni.
 */
export function initEmojiReactions() {
  if (_initialized) return;

  ensureStyle();
  ensureLayer();
  _initialized = true;
}



/**
 * Mostra il layer (senza rimuovere le emoji eventualmente presenti).
 */
export function showEmojiLayer() {
  const layer = document.getElementById(LAYER_ID) as HTMLElement | null;
  if (layer) {
    layer.style.display = "block";
    _visible = true;
  }
}



/**
 * Nasconde il layer (non rimuove le emoji, solo display:none).
 */
export function hideEmojiLayer() {
  const layer = document.getElementById(LAYER_ID) as HTMLElement | null;
  if (layer) {
    layer.style.display = "none";
    _visible = false;
  }
}



/**
 * Rimuove tutte le emoji attualmente in volo,
 * ma lascia il layer e lo stile in piedi.
 */
export function resetEmojiReactions() {
  const layer = document.getElementById(LAYER_ID) as HTMLElement | null;
  if (!layer) return;
  while (layer.firstChild) {
    layer.removeChild(layer.firstChild);
  }
}



/**
 * Rimuove completamente il layer e lo stile dal DOM.
 * (può essere richiamato, ad esempio, su RESET_STATE definitivo)
 */
export function removeEmojiLayer() {
  const layer = document.getElementById(LAYER_ID);
  if (layer && layer.parentElement) {
    layer.parentElement.removeChild(layer);
  }

  const styleEl = document.getElementById(STYLE_ID);
  if (styleEl && styleEl.parentElement) {
    styleEl.parentElement.removeChild(styleEl);
  }

  _initialized = false;
}



/**
 * Mostra una singola emoji che "parte" dal basso e fluttua verso l'alto,
 * con oscillazione e leggero zoom.
 *
 * Richiede che initEmojiReactions() sia stato chiamato almeno una volta.
 */
export function showEmojiReaction(emoji: string) {
  if (!_initialized) {
    initEmojiReactions();
  }

  const layer = document.getElementById(LAYER_ID) as HTMLElement | null;
  if (!layer) {
    console.warn("[EmojiReactions] Layer not found, cannot show emoji");
    return;
  }

  if (!_visible) {
    // Se il layer è nascosto, lo rendiamo visibile per mostrare la reazione.
    layer.style.display = "block";
    _visible = true;
  }

  // Limita il numero massimo di emoji contemporaneamente in volo
  const MAX_EMOJIS = 40;
  if (layer.childElementCount >= MAX_EMOJIS) {
    // rimuove le più vecchie
    const extra = layer.childElementCount - MAX_EMOJIS + 1;
    for (let i = 0; i < extra; i++) {
      const first = layer.firstElementChild;
      if (!first) break;
      layer.removeChild(first);
    }
  }

  const span = document.createElement("span");
  span.className = "mt-emoji-reaction";
  span.textContent = emoji;

  // Posizione orizzontale casuale (10% - 90%)
  const startX = 10 + Math.random() * 80;
  span.style.left = `${startX}%`;

  // Leggera variazione casuale sulla durata e sulla scala
  const baseDuration = 2200; // ms
  const durationJitter = 800; // ±
  const duration =
    baseDuration + (Math.random() * 2 - 1) * durationJitter;
  span.style.animationDuration = `${Math.max(1200, duration)}ms`;

  // Leggera variazione di delay per renderle meno "rigide"
  const delay = Math.random() * 200;
  span.style.animationDelay = `${delay}ms`;

  // Dimensione di base (in rem) + jitter
  const baseFontSize = 2.4; // rem
  const fontJitter = 0.6;
  const fontSize =
    baseFontSize + (Math.random() * 2 - 1) * fontJitter;
  span.style.fontSize = `${Math.max(1.6, fontSize)}rem`;

  // Hook per rimozione automatica quando l'animazione termina
  const handleEnd = () => {
    span.removeEventListener("animationend", handleEnd);
    if (span.parentElement === layer) {
      layer.removeChild(span);
    }
  };
  span.addEventListener("animationend", handleEnd);

  layer.appendChild(span);
}



/**
 * Assicura che esista il <style> globale per il layer e le emoji.
 */
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${LAYER_ID} {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483646; /* subito sotto l'overlay principale */
      overflow: visible;
    }

    .mt-emoji-reaction {
      position: absolute;
      bottom: -40px;
      transform: translate(0, 0) scale(0.9);
      opacity: 0;
      filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.6));
      will-change: transform, opacity;
      animation-name: mt-emoji-float-up;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }

    @keyframes mt-emoji-float-up {
      0% {
        transform: translate(0vw, 0) scale(0.9);
        opacity: 0;
      }
      20% {
        transform: translate(0vw, -20vh) scale(1);
        opacity: 0.9;
      }
      40% {
        transform: translate(0vw, -40vh) scale(1.05);
        opacity: 0.9;
      }
      60% {
        transform: translate(0vw, -60vh) scale(1.1);
        opacity: 0.8;
      }
      80% {
        transform: translate(0vw, -80vh) scale(1.14);
        opacity: 0.7;
      }
      100% {
        transform: translate(0vw, -100vh) scale(1.18);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}



/**
 * Assicura che esista il layer full-screen delle emoji.
 */
function ensureLayer() {
  if (document.getElementById(LAYER_ID)) return;

  const create = () => {
    if (document.getElementById(LAYER_ID)) return;
    const layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.style.display = "block";
    document.body.appendChild(layer);
  };

  if (document.body) {
    create();
  } else {
    // In casi rari in cui lo script gira prima che il body esista
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        try {
          create();
        } catch (e) {
          console.error("[EmojiReactions] Failed to create layer after DOMContentLoaded", e);
        }
      },
      { once: true }
    );
  }
}
