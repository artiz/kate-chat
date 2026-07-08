import { useCallback, useRef, useState } from "react";

export type RealtimeVoiceStatus = "disconnected" | "connecting" | "connected" | "error";

/** Connection info minted by the backend for a realtime voice session */
export interface RealtimeSessionInfo {
  transport: "webrtc" | "websocket";
  model: string;
  /** webrtc: short-lived client secret for the provider */
  clientSecret?: string;
  /** webrtc: SDP exchange endpoint, e.g. https://api.openai.com/v1/realtime?model=... */
  sdpUrl?: string;
  /** websocket: URL of the realtime events socket (usually a backend proxy) */
  wsUrl?: string;
}

export interface RealtimeTranscript {
  role: "user" | "assistant";
  text: string;
  itemId?: string;
}

interface UseRealtimeVoiceProps {
  /** Mints session connection info (ephemeral token / proxy URL) on the backend */
  getSession: () => Promise<RealtimeSessionInfo>;
  onTranscript?: (transcript: RealtimeTranscript) => void;
  onError?: (message: string) => void;
}

export interface UseRealtimeVoiceResult {
  status: RealtimeVoiceStatus;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: (newStatus?: "disconnected" | "error") => void;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
}

const WS_PCM_SAMPLE_RATE = 24000;

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function float32ToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Voice-to-voice session against an OpenAI-compatible Realtime API.
 * Supports the WebRTC transport (browser connects to the provider with an
 * ephemeral token) and a WebSocket transport (events + PCM16 audio relayed
 * through a backend proxy for providers without ephemeral tokens).
 */
export function useRealtimeVoice({ getSession, onTranscript, onError }: UseRealtimeVoiceProps): UseRealtimeVoiceResult {
  const [status, setStatus] = useState<RealtimeVoiceStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const disconnect = useCallback((newStatus: "disconnected" | "error" = "disconnected") => {
    pcRef.current?.close();
    pcRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    scheduledSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    scheduledSourcesRef.current.clear();
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    setInputAnalyser(null);
    setOutputAnalyser(null);
    setStatus(newStatus);
  }, []);

  const failWith = useCallback(
    (message: string) => {
      setError(message);
      onErrorRef.current?.(message);
      disconnect("error");
    },
    [disconnect]
  );

  /** Server events shared by both transports (OpenAI realtime protocol) */
  const handleRealtimeEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msg: any) => {
      switch (msg?.type) {
        // assistant said something (beta + GA event names)
        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done":
          if (msg.transcript) {
            onTranscriptRef.current?.({ role: "assistant", text: msg.transcript, itemId: msg.item_id });
          }
          break;
        // user said something
        case "conversation.item.input_audio_transcription.completed":
          if (msg.transcript) {
            onTranscriptRef.current?.({ role: "user", text: msg.transcript, itemId: msg.item_id });
          }
          break;
        case "response.done":
          if (msg.response?.status === "failed") {
            const detail = msg.response.status_details?.error;
            failWith(detail?.message || JSON.stringify(msg.response.status_details) || "Realtime response failed");
          }
          break;
        case "error":
          failWith(msg.error?.message || "Realtime API error");
          break;
      }
    },
    [failWith]
  );

  // #region WebRTC transport

  const connectWebRTC = useCallback(
    async (session: RealtimeSessionInfo) => {
      if (!session.clientSecret || !session.sdpUrl) {
        throw new Error("Realtime session is missing WebRTC connection info");
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      const speakerAnalyser = audioCtx.createAnalyser();
      speakerAnalyser.fftSize = 256;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = event => {
        if (event.streams[0]) {
          const stream = event.streams[0];
          audioEl.srcObject = stream;
          audioCtx.createMediaStreamSource(stream).connect(speakerAnalyser);
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      audioCtx.createMediaStreamSource(localStream).connect(micAnalyser);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = e => {
        try {
          handleRealtimeEvent(JSON.parse(e.data));
        } catch {
          // ignore malformed events
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(session.sdpUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed: ${sdpResponse.statusText}`);
      }

      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });

      setInputAnalyser(micAnalyser);
      setOutputAnalyser(speakerAnalyser);
      setStatus("connected");
    },
    [handleRealtimeEvent]
  );

  // #endregion

  // #region WebSocket transport (PCM16 relay through backend proxy)

  const connectWebSocket = useCallback(
    async (session: RealtimeSessionInfo) => {
      if (!session.wsUrl) {
        throw new Error("Realtime session is missing WebSocket connection info");
      }

      const audioCtx = new AudioContext({ sampleRate: WS_PCM_SAMPLE_RATE });
      audioContextRef.current = audioCtx;

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      const speakerAnalyser = audioCtx.createAnalyser();
      speakerAnalyser.fftSize = 256;
      speakerAnalyser.connect(audioCtx.destination);

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      const source = audioCtx.createMediaStreamSource(localStream);
      source.connect(micAnalyser);

      const ws = new WebSocket(session.wsUrl);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("Realtime socket connection failed"));
      });

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(String(e.data));
          // audio deltas (beta + GA event names): schedule PCM16 for playback
          if (msg.type === "response.audio.delta" || msg.type === "response.output_audio.delta") {
            const pcm = base64ToInt16(msg.delta || "");
            if (!pcm.length) return;
            const buffer = audioCtx.createBuffer(1, pcm.length, WS_PCM_SAMPLE_RATE);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < pcm.length; i++) {
              channel[i] = pcm[i] / 0x8000;
            }
            const bufferSource = audioCtx.createBufferSource();
            bufferSource.buffer = buffer;
            bufferSource.connect(speakerAnalyser);
            const startAt = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
            bufferSource.start(startAt);
            nextPlayTimeRef.current = startAt + buffer.duration;
            scheduledSourcesRef.current.add(bufferSource);
            bufferSource.onended = () => scheduledSourcesRef.current.delete(bufferSource);
            return;
          }
          // the user interrupted the assistant: drop scheduled playback
          if (msg.type === "input_audio_buffer.speech_started") {
            scheduledSourcesRef.current.forEach(s => {
              try {
                s.stop();
              } catch {
                // already stopped
              }
            });
            scheduledSourcesRef.current.clear();
            nextPlayTimeRef.current = 0;
          }
          handleRealtimeEvent(msg);
        } catch {
          // ignore malformed events
        }
      };
      ws.onclose = () => disconnect();

      // stream microphone PCM16 to the socket
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = e => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const audio = float32ToPcm16Base64(e.inputBuffer.getChannelData(0));
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      setInputAnalyser(micAnalyser);
      setOutputAnalyser(speakerAnalyser);
      setStatus("connected");
    },
    [handleRealtimeEvent, disconnect]
  );

  // #endregion

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    nextPlayTimeRef.current = 0;

    try {
      const session = await getSession();
      if (session.transport === "webrtc") {
        await connectWebRTC(session);
      } else {
        await connectWebSocket(session);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Realtime connection failed";
      setError(message);
      onErrorRef.current?.(message);
      disconnect("error");
    }
  }, [getSession, connectWebRTC, connectWebSocket, disconnect]);

  return { status, error, connect, disconnect, inputAnalyser, outputAnalyser };
}
