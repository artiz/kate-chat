import { useCallback, useRef, useState } from "react";
import { AudioInput } from "@/core";
import { arrayBufferToBase64, downsamplePcm, encodeWav } from "@/lib/audio.encoder";

const TARGET_SAMPLE_RATE = 16000;

export interface UseVoiceRecorderResult {
  recording: boolean;
  /** Live microphone analyser for visualization while recording */
  analyser: AnalyserNode | null;
  error: string | null;
  startRecording: () => Promise<void>;
  /** Stops recording and resolves with the recorded WAV audio (null if nothing was captured) */
  stopRecording: () => Promise<AudioInput | null>;
  /** Stops recording and discards the result */
  cancelRecording: () => void;
}

/**
 * Microphone recorder producing 16kHz mono 16-bit WAV (base64) —
 * the format accepted by audio-input chat models (e.g. gpt-4o-audio).
 */
export function useVoiceRecorder(): UseVoiceRecorderResult {
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setAnalyser(null);
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      const micAnalyser = audioCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      source.connect(micAnalyser);
      setAnalyser(micAnalyser);

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = e => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);

      startedAtRef.current = performance.now();
      setRecording(true);
    } catch (err) {
      cleanup();
      const message = err instanceof Error ? err.message : "Microphone access failed";
      setError(message);
      throw err;
    }
  }, [cleanup]);

  const stopRecording = useCallback(async (): Promise<AudioInput | null> => {
    const audioCtx = audioContextRef.current;
    const sampleRate = audioCtx?.sampleRate || TARGET_SAMPLE_RATE;
    cleanup();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!chunks.length) return null;

    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    const downsampled = downsamplePcm(samples, sampleRate, TARGET_SAMPLE_RATE);
    const wav = encodeWav(downsampled, Math.min(sampleRate, TARGET_SAMPLE_RATE));

    return {
      fileName: `voice-message-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`,
      mimeType: "audio/wav",
      bytesBase64: `data:audio/wav;base64,${arrayBufferToBase64(wav)}`,
      durationSec: Math.round((performance.now() - startedAtRef.current) / 1000),
    };
  }, [cleanup]);

  const cancelRecording = useCallback(() => {
    chunksRef.current = [];
    cleanup();
  }, [cleanup]);

  return { recording, analyser, error, startRecording, stopRecording, cancelRecording };
}
