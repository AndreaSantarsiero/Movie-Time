// Self-NAT-diagnostic basato esclusivamente su STUN / ICE.
// Obiettivo: capire quanto la rete locale è favorevole a P2P via UDP hole punching,
// restituendo un esito ad alta sintesi per la UI del popup:
//
//   - "GREEN"  → Alta probabilità di successo
//   - "YELLOW" → Potrebbe funzionare, non garantito
//   - "RED"    → Molto improbabile che funzioni
//   - "ERROR"  → Test non riuscito / ambiente non supportato
//
// Il test è *locale* (non coinvolge l’altro peer):
//   - una *sola* RTCPeerConnection con più server STUN;
//   - osserviamo tutti i candidati srflx prodotti da quella PC;
//   - non inferiamo più il tipo di NAT dalle differenze di porta tra peer connection diverse
//     (che dipendono anche dal browser), ma solo da:
//       * presenza/assenza di srflx (STUN bloccato);
//       * numero di IP pubblici diversi (multi NAT);
//       * stabilità della coppia ip:porta all'interno della stessa PC.

export type NatOutcome = "GREEN" | "YELLOW" | "RED" | "ERROR";

export type NatBehavior =
  | "ENDPOINT_INDEPENDENT"          // cone-like, molto friendly (tutti i srflx hanno stessa ip:port)
  | "ADDRESS_OR_PORT_DEPENDENT"     // più restrittivo, ma non catastrofico
  | "SYMMETRIC_OR_MULTIPLE_NAT"     // multi-IP pubblico / situazione anomala
  | "UNKNOWN";


export interface NatSample {
  stunUrl: string;
  attemptIndex: number;              // indice del candidato raccolto (sequenziale)
  publicIp?: string;
  publicPort?: number;
  rawCandidates: string[];
  durationMs: number;
}


export interface NatMetrics {
  totalSamples: number;              // numero di candidati srflx raccolti
  successfulSamples: number;         // uguale a totalSamples (se parse srflx va a buon fine)
  successRatio: number;              // successfulSamples / totalSamples (0 o 1 qui)

  distinctPublicIps: number;
  sameIpRatio: number;               // frequenza dell'IP più comune / successfulSamples

  distinctMappings: number;          // combinazioni distinte ip:port
  portStabilityScore: number;        // riuso della stessa porta (maxPortCount / totalSamples)

  hasMultiNatSymptoms: boolean;      // più IP pubblici osservati
  hasSymmetricSymptoms: boolean;     // qui coincide con hasMultiNatSymptoms

  approxDurationMs: number;          // durata totale del test vista dal chiamante
}


export interface NatTestResult {
  outcome: NatOutcome;
  natBehavior: NatBehavior;
  reason: string;
  warnings: string[];
  metrics: NatMetrics;
  samples: NatSample[];
}


// Opzioni configurabili dal popup o dal chiamante interno
export interface NatTestOptions {
  // Timeout per la raccolta ICE in ms
  perRoundTimeoutMs?: number;

  // Lista di STUN server. Verranno usati tutti in un'unica RTCPeerConnection.
  stunUrls?: string[];

  // Non più usato nel nuovo approccio, tenuto solo per compatibilità.
  samplesPerServer?: number;
}



// -------------------------------
// Utility: parsing candidati srflx
// -------------------------------

interface SrflxInfo {
  ip: string;
  port: number;
}

function parseSrflx(candidateInit: RTCIceCandidateInit): SrflxInfo | null {
  const c = candidateInit.candidate || "";

  // Alcune implementazioni espongono già il tipo / address / port
  const anyCandidate: any = candidateInit as any;
  if (anyCandidate.type === "srflx" && anyCandidate.address && anyCandidate.port) {
    return {
      ip: String(anyCandidate.address),
      port: Number(anyCandidate.port),
    };
  }

  // Fallback: parsing stringa SDP
  // Formato tipico:
  // candidate:<foundation> <comp> <transport> <priority> <ip> <port> typ srflx ...
  const m = c.match(
    /candidate:\S+\s+\d+\s+\w+\s+\d+\s+([0-9a-fA-F\.:]+)\s+(\d+)\s+typ\s+srflx/i
  );
  if (!m) return null;

  return {
    ip: m[1],
    port: Number(m[2]),
  };
}



// -------------------------------
// Analisi dei campioni raccolti
// -------------------------------

function computeMetrics(samples: NatSample[]): NatMetrics {
  const totalSamples = samples.length;
  const valid = samples.filter((s) => s.publicIp && typeof s.publicPort === "number");
  const successfulSamples = valid.length;
  const successRatio = totalSamples > 0 ? successfulSamples / totalSamples : 0;

  const ipCounts = new Map<string, number>();
  const mappingCounts = new Map<string, number>();
  const portCounts = new Map<number, number>();

  let totalDuration = 0;
  for (const s of samples) {
    totalDuration += s.durationMs;
  }

  for (const s of valid) {
    const ip = s.publicIp as string;
    const port = s.publicPort as number;

    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    const key = `${ip}:${port}`;
    mappingCounts.set(key, (mappingCounts.get(key) ?? 0) + 1);
    portCounts.set(port, (portCounts.get(port) ?? 0) + 1);
  }

  const distinctPublicIps = ipCounts.size;
  const distinctMappings = mappingCounts.size;

  let sameIpRatio = 0;
  if (successfulSamples > 0 && ipCounts.size > 0) {
    const maxIpCount = Math.max(...Array.from(ipCounts.values()));
    sameIpRatio = maxIpCount / successfulSamples;
  }

  let portStabilityScore = 0;
  if (successfulSamples > 0 && portCounts.size > 0) {
    const maxPortCount = Math.max(...Array.from(portCounts.values()));
    portStabilityScore = maxPortCount / successfulSamples; // 1 => una sola porta, 0.x => molte porte diverse
  }

  const hasMultiNatSymptoms = distinctPublicIps > 1;
  const hasSymmetricSymptoms = hasMultiNatSymptoms;

  const metrics: NatMetrics = {
    totalSamples,
    successfulSamples,
    successRatio,
    distinctPublicIps,
    sameIpRatio,
    distinctMappings,
    portStabilityScore,
    hasMultiNatSymptoms,
    hasSymmetricSymptoms,
    approxDurationMs: totalDuration,
  };

  console.log("[NAT TEST] metrics", metrics);
  return metrics;
}



function classifyBehavior(metrics: NatMetrics): NatBehavior {
  const { successfulSamples, distinctPublicIps, distinctMappings } = metrics;

  if (successfulSamples === 0) {
    return "UNKNOWN";
  }

  if (distinctPublicIps > 1) {
    // Più IP pubblici visti dai server STUN → forte sintomo di multi NAT / CGNAT
    return "SYMMETRIC_OR_MULTIPLE_NAT";
  }

  if (distinctMappings === 1) {
    // Tutti i candidati srflx hanno stessa ip:port → mapping molto stabile
    return "ENDPOINT_INDEPENDENT";
  }

  // Singolo IP pubblico ma porte diverse nel corso della raccolta:
  // non è per forza "simmetrico" in senso stretto, ma non è nemmeno cone-like puro.
  return "ADDRESS_OR_PORT_DEPENDENT";
}



function classifyOutcome(
  metrics: NatMetrics,
  behavior: NatBehavior
): { outcome: NatOutcome; reason: string; warnings: string[] } {
  const warnings: string[] = [];

  if (metrics.totalSamples === 0) {
    return {
      outcome: "ERROR",
      reason: "Test failed. Your browser or network blocked the check.",
      warnings: [
        "Make sure you are online and using a modern browser."
      ],
    };
  }

  if (metrics.successfulSamples === 0) {
    return {
      outcome: "RED",
      reason: "Your network is blocking the connection test.",
      warnings: [
        "Try a different Wi-Fi or disable VPN/firewall temporarily."
      ],
    };
  }

  if (behavior === "SYMMETRIC_OR_MULTIPLE_NAT") {
    return {
      outcome: "RED",
      reason: "Very low chance this will work on this network.",
      warnings: [
        "Try another network (home Wi-Fi, mobile hotspot, etc.)."
      ],
    };
  }

  if (behavior === "ENDPOINT_INDEPENDENT") {
    return {
      outcome: "GREEN",
      reason: "High chance this will work on this network.",
      warnings,
    };
  }

  if (behavior === "ADDRESS_OR_PORT_DEPENDENT") {
    return {
      outcome: "YELLOW",
      reason: "It could work, but it's not guaranteed.",
      warnings: [
        "If you have issues, try switching to another network."
      ],
    };
  }

  // UNKNOWN but with some srflx → treat as cautious yellow
  return {
    outcome: "YELLOW",
    reason: "The test was inconclusive, but it might still work.",
    warnings: [
      "If you have issues, try running the test again or use another network."
    ],
  };
}



// -------------------------------
// API principale da usare nel popup
// -------------------------------

export async function runNatSelfTest(
  opts: NatTestOptions = {}
): Promise<NatTestResult> {
  const timeoutMs = opts.perRoundTimeoutMs ?? 3000;
  const stunUrls =
    opts.stunUrls ??
    [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ];

  const iceServers: RTCIceServer[] = stunUrls.map((url) => ({ urls: url }));

  const samples: NatSample[] = [];
  const start = (typeof performance !== "undefined" ? performance.now() : Date.now());

  let pc: RTCPeerConnection | null = null;

  try {
    pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: "all",
    });

    pc.createDataChannel("nat-probe");

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const json = ev.candidate.toJSON();
      const srflx = parseSrflx(json);
      if (!srflx) return;

      const anyCand: any = ev.candidate;
      const stunUrlFromCandidate: string =
        anyCand.url || "stun:unknown";

      samples.push({
        stunUrl: stunUrlFromCandidate,
        attemptIndex: samples.length,
        publicIp: srflx.ip,
        publicPort: srflx.port,
        rawCandidates: [ev.candidate.candidate],
        durationMs: 0, // valorizzato dopo
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pc!.addEventListener("icegatheringstatechange", () => {
        if (pc && pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  } catch (err) {
    console.error("[NAT TEST] runNatSelfTest error", err);
  } finally {
    if (pc) pc.close();
  }

  const end = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const durationMs = end - start;

  for (const s of samples) {
    s.durationMs = durationMs;
  }

  const metrics = computeMetrics(samples);
  metrics.approxDurationMs = durationMs;

  const behavior = classifyBehavior(metrics);
  console.log("[NAT TEST] behavior", behavior);

  const { outcome, reason, warnings } = classifyOutcome(metrics, behavior);
  console.log("[NAT TEST] outcome", outcome, reason);

  return {
    outcome,
    natBehavior: behavior,
    reason,
    warnings,
    metrics,
    samples,
  };
}



// -------------------------------
// Helper per il popup: stringhe brevi
// -------------------------------

export function formatNatPopupSummary(
  result: NatTestResult
): { label: string; description: string } {
  const { outcome, reason } = result;

  if (outcome === "GREEN") {
    return {
      label: "Good connection",
      description: reason,
    };
  }
  if (outcome === "YELLOW") {
    return {
      label: "Uncertain",
      description: reason,
    };
  }
  if (outcome === "RED") {
    return {
      label: "Poor connection",
      description: reason,
    };
  }

  return {
    label: "Test failed",
    description: reason,
  };
}
