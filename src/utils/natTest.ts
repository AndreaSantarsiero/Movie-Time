export type NatOutcome =
  | "OK_ENDPOINT_INDEPENDENT"
  | "POSSIBLY_SYMMETRIC"
  | "STUN_BLOCKED"
  | "INCONCLUSIVE";


export interface NatMapping {
  stunUrl: string;
  publicIp?: string;
  publicPort?: number;
  rawCandidates: string[];
}



function parseSrflx(candidate: RTCIceCandidateInit): { ip: string; port: number } | null {
  const c = candidate.candidate || "";
  // prova proprietà moderne
  // @ts-ignore
  if ((candidate as any).type === "srflx" && (candidate as any).address && (candidate as any).port) {
    // @ts-ignore
    return { ip: (candidate as any).address, port: Number((candidate as any).port) };
  }
  // fallback: parsing stringa SDP
  // RFC 8445 form: foundation comp transport priority ip port typ srflx ...
  const m = c.match(/candidate:\S+\s+\d+\s+\w+\s+\d+\s+([0-9a-fA-F\.:]+)\s+(\d+)\s+typ\s+srflx/i);
  if (!m) return null;
  return { ip: m[1], port: Number(m[2]) };
}



async function gatherFrom(stunUrl: string, timeoutMs = 2000): Promise<NatMapping> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
  const rawCandidates: string[] = [];
  let mapping: { ip?: string; port?: number } = {};

  // innesca ICE
  pc.createDataChannel("probe");
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      rawCandidates.push(ev.candidate.candidate);
      const srflx = parseSrflx(ev.candidate.toJSON());
      if (srflx && !mapping.ip) mapping = { ip: srflx.ip, port: srflx.port };
    }
  };

  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);

  await new Promise<void>((resolve) => {
    const to = setTimeout(resolve, timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(to);
        resolve();
      }
    });
  });

  const res: NatMapping = { stunUrl, publicIp: mapping.ip, publicPort: mapping.port, rawCandidates };
  pc.close();
  return res;
}

export async function testNatSymmetry(opts?: {
  timeoutMs?: number;
  stunUrls?: string[];
}): Promise<{ outcome: NatOutcome; mappings: NatMapping[]; reason: string }> {
  const timeoutMs = opts?.timeoutMs ?? 2200;
  const stunUrls =
    opts?.stunUrls ??
    [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ];

  const mappings: NatMapping[] = [];
  for (const url of stunUrls) {
    try {
      mappings.push(await gatherFrom(url, timeoutMs));
    } catch {
      mappings.push({ stunUrl: url, rawCandidates: [] });
    }
  }

  // raccogli tutti gli srflx validi
  const valid = mappings.filter((m) => m.publicIp && m.publicPort) as Required<NatMapping>[];

  if (valid.length === 0) {
    return { outcome: "STUN_BLOCKED", mappings, reason: "Nessun candidato srflx raccolto" };
  }
  if (valid.length === 1) {
    return { outcome: "INCONCLUSIVE", mappings, reason: "Un solo srflx: confronti insufficienti" };
  }

  const first = `${valid[0].publicIp}:${valid[0].publicPort}`;
  const anyDiff = valid.some((m) => `${m.publicIp}:${m.publicPort}` !== first);

  if (anyDiff) {
    return {
      outcome: "POSSIBLY_SYMMETRIC",
      mappings,
      reason: "Mappature pubbliche diverse tra STUN → probabile NAT simmetrico",
    };
  }
  return {
    outcome: "OK_ENDPOINT_INDEPENDENT",
    mappings,
    reason: "Stessa mappatura pubblica su più STUN",
  };
}



export function formatNatResult(res: { outcome: NatOutcome; reason: string; mappings: NatMapping[] }) {
  const lines: string[] = [];
  const emoji =
    res.outcome === "OK_ENDPOINT_INDEPENDENT" ? "✅" :
    res.outcome === "POSSIBLY_SYMMETRIC" ? "⚠️" :
    res.outcome === "STUN_BLOCKED" ? "❌" : "ℹ️";

  lines.push(`${emoji} ${res.outcome.replace(/_/g, " ")} – ${res.reason}`);
  const pretty = res.mappings
    .map((m) => `• ${m.stunUrl} → ${m.publicIp ? `${m.publicIp}:${m.publicPort}` : "—"}`)
    .join("\n");
  lines.push(pretty);
  if (res.outcome === "POSSIBLY_SYMMETRIC") {
    lines.push("Suggerimento: prova un'altra rete o aggiungi un TURN.");
  }
  return lines.join("\n");
}
