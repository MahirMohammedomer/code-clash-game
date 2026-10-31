/**
 * Offline peer-to-peer play (Mini-Militia-style) for the web.
 *
 * Browsers can't scan a LAN, so two phones pair by exchanging WebRTC
 * session descriptions as QR codes (or pasted text). After pairing, the
 * RTCDataChannel runs directly phone-to-phone over the same WiFi/hotspot —
 * no internet, no server. We wait for ICE gathering to finish so a single
 * QR blob contains everything (host candidates included).
 */

export type PeerMessage =
  | { t: "hello"; name: string; avatar: unknown; frame: string }
  | { t: "ready" } // secret is locked in (never sent!)
  | { t: "guess"; id: string; guess: string }
  | { t: "feedback"; id: string; guess: string; points: number; orders: number; win: boolean }
  | { t: "timeout" }
  | { t: "chat"; text: string }
  | { t: "reaction"; id: string }
  | { t: "forfeit" }
  | { t: "reveal"; secret: string }
  | { t: "rematch" }
  | { t: "rematch_no" };

export interface PeerConn {
  send: (msg: PeerMessage) => void;
  onMessage: (fn: (msg: PeerMessage) => void) => void;
  onState: (fn: (state: RTCPeerConnectionState) => void) => void;
  close: () => void;
  isOpen: () => boolean;
}

/* ------------------------- SDP pack / unpack ------------------------- */

async function gzipToBase64Url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return "z" + bytesToB64Url(new Uint8Array(buf));
  }
  return "r" + bytesToB64Url(bytes);
}

async function base64UrlToText(code: string): Promise<string> {
  const trimmed = code.trim();
  const kind = trimmed[0];
  const bytes = b64UrlToBytes(trimmed.slice(1));
  if (kind === "z" && typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buf);
  }
  return new TextDecoder().decode(bytes);
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function packSDP(desc: RTCSessionDescriptionInit): Promise<string> {
  return gzipToBase64Url(JSON.stringify(desc));
}

export async function unpackSDP(code: string): Promise<RTCSessionDescriptionInit> {
  return JSON.parse(await base64UrlToText(code)) as RTCSessionDescriptionInit;
}

/* ------------------------------ connection ------------------------------ */

function waitIceComplete(pc: RTCPeerConnection, timeoutMs = 4500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

function wrap(pc: RTCPeerConnection, channel: RTCDataChannel): PeerConn {
  let msgFn: ((msg: PeerMessage) => void) | null = null;
  let stateFn: ((s: RTCPeerConnectionState) => void) | null = null;
  const queued: PeerMessage[] = [];

  const flush = () => {
    if (!msgFn) return;
    while (queued.length) msgFn(queued.shift() as PeerMessage);
  };

  channel.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as PeerMessage;
      if (msgFn) msgFn(msg);
      else queued.push(msg);
    } catch {}
  };
  pc.onconnectionstatechange = () => stateFn?.(pc.connectionState);

  return {
    send: (msg) => {
      try {
        if (channel.readyState === "open") channel.send(JSON.stringify(msg));
      } catch {}
    },
    onMessage: (fn) => {
      msgFn = fn;
      flush();
    },
    onState: (fn) => {
      stateFn = fn;
      fn(pc.connectionState);
    },
    close: () => {
      try { channel.close(); } catch {}
      try { pc.close(); } catch {}
    },
    isOpen: () => channel.readyState === "open",
  };
}

export interface HostSession {
  offerCode: string;
  acceptAnswer: (code: string) => Promise<PeerConn>;
  cancel: () => void;
}

export async function createHost(): Promise<HostSession> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const channel = pc.createDataChannel("cipher-clash", { ordered: true });
  const conn = wrap(pc, channel);
  const opened = new Promise<void>((resolve) => {
    channel.onopen = () => resolve();
  });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  const offerCode = await packSDP(pc.localDescription as RTCSessionDescriptionInit);
  return {
    offerCode,
    acceptAnswer: async (code: string) => {
      const answer = await unpackSDP(code);
      await pc.setRemoteDescription(answer);
      await opened;
      return conn;
    },
    cancel: () => conn.close(),
  };
}

export interface GuestSession {
  answerCode: string;
  conn: PeerConn;
  whenOpen: Promise<void>;
}

export async function createGuest(offerCode: string): Promise<GuestSession> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  let resolveOpen: () => void = () => {};
  const whenOpen = new Promise<void>((resolve) => (resolveOpen = resolve));
  let conn: PeerConn | null = null;

  pc.ondatachannel = (ev) => {
    conn = wrap(pc, ev.channel);
    ev.channel.onopen = () => resolveOpen();
    if (ev.channel.readyState === "open") resolveOpen();
  };

  const offer = await unpackSDP(offerCode);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc);
  const answerCode = await packSDP(pc.localDescription as RTCSessionDescriptionInit);

  // conn is assigned in ondatachannel before setRemoteDescription resolves in practice,
  // but guard just in case by waiting a tick.
  if (!conn) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return { answerCode, conn: conn as unknown as PeerConn, whenOpen };
}

export function peerSupported(): boolean {
  return typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined";
}
