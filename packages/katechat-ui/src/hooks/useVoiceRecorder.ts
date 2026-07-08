import { useCallback, useRef, useState } from "react";
import { AudioInput } from "@/core";

const TARGET_SAMPLE_RATE = 16000;

/** Downsample Float32 PCM to the target rate with simple linear interpolation */
function downsample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return samples;
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const frac = pos - left;
    result[i] = samples[left] * (1 - frac) + samples[right] * frac;
  }
  return result;
}

/** Encode mono Float32 PCM into a 16-bit WAV file */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

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

    const downsampled = downsample(samples, sampleRate, TARGET_SAMPLE_RATE);
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
