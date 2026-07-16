/**
 * useSimliAvatar — reusable Simli talking-avatar WebRTC bring-up
 * ---------------------------------------------------------------
 * Extracted from the same live-avatar plumbing the Talking IT Advisor uses so
 * a second face-to-face feature (the member Ordering Avatar) can reuse it
 * without duplicating the WebRTC/LiveKit lifecycle.
 *
 * It talks ONLY to the SAME-ORIGIN Simli proxy (`/api/simli`, overridable with
 * VITE_SIMLI_PROXY_BASE) which injects the Simli apiKey + faceId server-side and
 * mints a session token — the key NEVER reaches the browser bundle.
 *
 * Resilience: Simli is UNSTABLE. This hook bounds the connect window and, on any
 * failure (bad handshake, no token, connect timeout, or a live session that later
 * drops), transitions to `failed` and fires an `ai_outage` telemetry event. The
 * caller degrades to its own text experience — the page is never blocked.
 *
 * The hook renders no UI: it exposes the state machine + the video/audio refs to
 * attach, plus start/stop controls. Voicing answers is the caller's job (the SDK
 * paints a face but has no built-in TTS).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/stable/analytics';

// ── Same-origin Simli proxy (no secret in the browser) ───────────────────────

const SIMLI_PROXY_BASE: string =
  (import.meta.env.VITE_SIMLI_PROXY_BASE as string | undefined) ?? '/api/simli';

/** How long we give the live avatar to actually connect before degrading. */
const AVATAR_CONNECT_TIMEOUT_MS = 12000;

/** LogLevel.ERROR from the SDK — keep the WebRTC client quiet in the console. */
const SIMLI_LOG_ERROR = 2;

interface SimliSession {
  session_token?: string;
  sessionToken?: string;
  [k: string]: unknown;
}

interface SimliClientLike {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  on?: (evt: string, cb: (...args: unknown[]) => void) => void;
  off?: (evt: string, cb: (...args: unknown[]) => void) => void;
}

type SimliClientCtor = new (
  sessionToken: string,
  videoElement: HTMLVideoElement,
  audioElement: HTMLAudioElement,
  iceServers: RTCIceServer[] | null,
  logLevel?: number,
  transport?: 'livekit' | 'p2p',
) => SimliClientLike;

/** Lazy-load the real SDK so its heavy WebRTC/LiveKit deps stay out of the main
 *  bundle and only load once Simli is healthy. Missing → degrade to text. */
async function loadSimliClient(): Promise<SimliClientCtor | null> {
  try {
    const mod = (await import('simli-client')) as Record<string, unknown>;
    const ctor = mod.SimliClient;
    return typeof ctor === 'function' ? (ctor as SimliClientCtor) : null;
  } catch {
    return null;
  }
}

/** Start a Simli audio-to-video session via the same-origin proxy. */
async function startSimliSession(signal: AbortSignal): Promise<SimliSession> {
  const base = SIMLI_PROXY_BASE.replace(/\/$/, '');
  const body = JSON.stringify({ handleSilence: true, maxSessionLength: 1800, maxIdleTime: 300 });
  let lastErr: unknown = new Error('Simli session proxy unreachable');
  for (const path of ['/start', '/session']) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
      });
      if (res.ok) return (await res.json()) as SimliSession;
      lastErr = new Error(`Simli session proxy HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function stopClient(client: SimliClientLike | null): Promise<void> {
  try {
    await client?.stop?.();
  } catch {
    /* ignore teardown errors */
  }
}

export type AvatarState = 'connecting' | 'live' | 'failed' | 'stopped';

export interface UseSimliAvatar {
  /** Current avatar lifecycle state. */
  state: AvatarState;
  /** True while the SDK reports the face is actively speaking. */
  speaking: boolean;
  /** Attach to a <video> element. */
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  /** Attach to a hidden <audio> element. */
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  /** End the live session (reversible via restart). */
  endSession: () => void;
  /** Re-run the connect flow after a stop / failure. */
  restart: () => void;
}

/**
 * Bring up (and manage the lifecycle of) a live Simli talking avatar.
 *
 * @param feature  Telemetry feature name (e.g. "ordering-avatar").
 */
export function useSimliAvatar(feature: string): UseSimliAvatar {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clientRef = useRef<SimliClientLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // True while a user-initiated stop is in progress, so the SDK's own
  // stop/error events aren't mistaken for an outage.
  const endingRef = useRef(false);

  const [state, setState] = useState<AvatarState>('connecting');
  const [speaking, setSpeaking] = useState(false);
  // Bumping this re-runs the connect effect (used to restart after a stop).
  const [sessionNonce, setSessionNonce] = useState(0);

  useEffect(() => {
    let disposed = false;
    let outcome: 'pending' | 'live' | 'failed' = 'pending';
    const controller = new AbortController();
    abortRef.current = controller;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;

    const clearConnectTimer = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = undefined;
      }
    };

    // Report the outage exactly once and hand control back to the caller's text
    // fallback — on a failed handshake OR a live session that later drops.
    const degrade = (error: unknown) => {
      if (disposed || outcome === 'failed') return;
      outcome = 'failed';
      clearConnectTimer();
      track({
        event: 'ai_outage',
        eventType: 'error',
        metadata: {
          service: 'simli',
          feature,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      void stopClient(clientRef.current);
      clientRef.current = null;
      setSpeaking(false);
      setState('failed');
    };

    const goLive = () => {
      if (disposed || outcome !== 'pending') return;
      outcome = 'live';
      clearConnectTimer();
      setState('live');
      track({ event: 'avatar_live', eventType: 'ai', metadata: { feature } });
    };

    const connect = async () => {
      try {
        const Ctor = await loadSimliClient();
        if (!Ctor) throw new Error('simli-client unavailable');
        if (disposed) return;

        const session = await startSimliSession(controller.signal);
        if (disposed) return;

        const token = session.session_token ?? session.sessionToken;
        if (!token) throw new Error('no session token from proxy');

        const video = videoRef.current;
        const audioEl = audioRef.current;
        if (!video || !audioEl) throw new Error('media elements unavailable');

        // LiveKit transport needs only the token — P2P would require ICE servers
        // we cannot mint client-side without the (server-only) Simli key.
        const client = new Ctor(token, video, audioEl, null, SIMLI_LOG_ERROR, 'livekit');
        clientRef.current = client;

        client.on?.('speaking', () => {
          if (!disposed) setSpeaking(true);
        });
        client.on?.('silent', () => {
          if (!disposed) setSpeaking(false);
        });
        client.on?.('error', (m) => {
          if (!endingRef.current) degrade(new Error(`simli-error:${String(m)}`));
        });
        client.on?.('stop', () => {
          if (!endingRef.current && outcome === 'live') degrade(new Error('simli-stopped'));
        });

        video.addEventListener('playing', goLive, { once: true });

        connectTimer = setTimeout(
          () => degrade(new Error('avatar-connect-timeout')),
          AVATAR_CONNECT_TIMEOUT_MS,
        );

        await client.start();
        if (disposed) return;
        goLive();
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (!aborted) degrade(err);
      }
    };

    void connect();

    return () => {
      disposed = true;
      clearConnectTimer();
      controller.abort();
      void stopClient(clientRef.current);
      clientRef.current = null;
    };
  }, [sessionNonce, feature]);

  const endSession = useCallback(() => {
    endingRef.current = true;
    void stopClient(clientRef.current);
    clientRef.current = null;
    setSpeaking(false);
    setState('stopped');
  }, []);

  const restart = useCallback(() => {
    endingRef.current = false;
    setSpeaking(false);
    setState('connecting');
    setSessionNonce((n) => n + 1);
  }, []);

  return { state, speaking, videoRef, audioRef, endSession, restart };
}
