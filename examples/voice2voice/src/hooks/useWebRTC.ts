import { useState, useRef, useCallback, useEffect } from "react";

interface UseWebRTCProps {
  apiKey: string;
  model: string;
}

export function useWebRTC({ apiKey, model }: UseWebRTCProps) {
  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Keep track of message handlers
  const messageHandlersRef = useRef<Set<(msg: any) => void>>(new Set());

  const registerMessageHandler = useCallback((handler: (msg: any) => void) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  const disconnect = useCallback(
    (newStatus: "disconnected" | "error" = "disconnected") => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (dcRef.current) {
        dcRef.current.close();
        dcRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (audioElRef.current) {
        audioElRef.current.srcObject = null;
        audioElRef.current.remove();
        audioElRef.current = null;
      }
      setRemoteStream(null);
      setStatus(newStatus);
    },
    [],
  );

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError("API Key is required");
      return;
    }

    setStatus("connecting");
    setError(null);

    try {
      // 1. Get ephemeral token
      const sessionResponse = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            voice: "shimmer",
            input_audio_transcription: {
              model: "whisper-1",
            },
          }),
        },
      );

      if (!sessionResponse.ok) {
        throw new Error(
          `Failed to create session: ${sessionResponse.statusText}`,
        );
      }

      const sessionData = await sessionResponse.json();
      const ephemeralToken = sessionData.client_secret.value;

      // 2. Initialize WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add audio visualization setup
      const audioCtx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      // Output analyser (remote audio)
      const outputAnalyser = audioCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;

      // Input analyser (local microphone)
      const inputAnalyser = audioCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;

      // Handle remote audio
      // Create an audio element to play the remote track
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (event) => {
        if (event.streams[0]) {
          const stream = event.streams[0];
          audioEl.srcObject = stream;
          setRemoteStream(stream);

          // Connect remote stream to analyser
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(outputAnalyser);
          // outputAnalyser.connect(audioCtx.destination); // No need, audioEl plays it?
          // Actually, if we use audioEl, we don't need to connect to destination in Web Audio graph
          // But for visualization we need source.connect(analyser)
        }
      };

      // Get microphone access
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Add local track to PC
      localStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStream));

      // Connect local stream to analyser
      const source = audioCtx.createMediaStreamSource(localStream);
      source.connect(inputAnalyser);

      // Create data channel
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("Data channel opened");
      };

      dc.onmessage = (e) => {
        // Handle server events (transcriptions, function calls, etc.)
        try {
          const msg = JSON.parse(e.data);
          console.log("Received event:", msg);

          // Error handling for response.done with failed status
          if (
            msg.type === "response.done" &&
            msg.response?.status === "failed"
          ) {
            const errorDetails = msg.response.status_details?.error;
            const errorMessage =
              errorDetails?.message ||
              JSON.stringify(msg.response.status_details) ||
              "Unknown error";
            console.error("Realtime API Error:", errorMessage);
            setError(errorMessage);
            disconnect("error");
            return;
          }
          // Error handling for generic error events
          else if (msg.type === "error") {
            const errorMessage = msg.error?.message || "Unknown error";
            console.error("Realtime API Error Event:", errorMessage);
            setError(errorMessage);
            disconnect("error");
            return;
          }

          messageHandlersRef.current.forEach((h) => h(msg));
        } catch (err) {
          console.error("Failed to parse message", err);
        }
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send SDP to OpenAI
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${model}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            "Content-Type": "application/sdp",
          },
        },
      );

      if (!sdpResponse.ok) {
        throw new Error(`Failed to send SDP: ${sdpResponse.statusText}`);
      }

      const answerSdp = await sdpResponse.text();
      const answer = {
        type: "answer" as RTCSdpType,
        sdp: answerSdp,
      };

      await pc.setRemoteDescription(answer);

      setStatus("connected");
    } catch (err: any) {
      console.error("Connection failed:", err);
      setError(err.message || "Connection failed");
      disconnect("error");
    }
  }, [apiKey, model, disconnect]);

  return {
    status,
    error,
    connect,
    disconnect,
    registerMessageHandler,
    inputAnalyser: inputAnalyserRef.current,
    outputAnalyser: outputAnalyserRef.current,
  };
}
