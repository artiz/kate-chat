import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  inputAnalyser?: AnalyserNode | null;
  outputAnalyser?: AnalyserNode | null;
  /** Canvas height in CSS pixels; width follows the container */
  height?: number;
  colorUser?: string;
  colorAssistant?: string;
  delimiterColor?: string;
  className?: string;
}

const BUFFER_LENGTH = 32; // low bin count for a "bars" look

/**
 * Mirrored spectrum equalizer: user microphone in the top half,
 * assistant audio in the bottom half. Resizes with its container.
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  inputAnalyser,
  outputAnalyser,
  height = 96,
  colorUser = "var(--mantine-color-blue-5)",
  colorAssistant = "var(--mantine-color-teal-5)",
  delimiterColor = "var(--mantine-color-default-border)",
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const cssWidth = canvas.parentElement?.clientWidth || 300;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${height}px`;
    };
    resize();

    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement);
    }

    // canvas fillStyle does not understand CSS variables — resolve them once
    const styles = getComputedStyle(canvas);
    const resolveColor = (color: string): string => {
      const match = color.match(/^var\((--[^,)]+)(?:,\s*([^)]+))?\)$/);
      if (!match) return color;
      return styles.getPropertyValue(match[1]).trim() || match[2] || "#888";
    };
    const userColor = resolveColor(colorUser);
    const assistantColor = resolveColor(colorAssistant);
    const lineColor = resolveColor(delimiterColor);

    const dataArrayInput = new Uint8Array(BUFFER_LENGTH);
    const dataArrayOutput = new Uint8Array(BUFFER_LENGTH);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (inputAnalyser) {
        inputAnalyser.getByteFrequencyData(dataArrayInput);
      } else {
        dataArrayInput.fill(0);
      }
      if (outputAnalyser) {
        outputAnalyser.getByteFrequencyData(dataArrayOutput);
      } else {
        dataArrayOutput.fill(0);
      }

      const barWidth = w / BUFFER_LENGTH;
      const gap = Math.min(2 * dpr, barWidth / 4);

      // user (microphone): bars grow up from the center line
      ctx.fillStyle = userColor;
      for (let i = 0; i < BUFFER_LENGTH; i++) {
        const v = dataArrayInput[i] / 255;
        const barHeight = Math.min(v * (h / 2) * 1.5, h / 2);
        ctx.fillRect(i * barWidth, h / 2 - barHeight, barWidth - gap, barHeight);
      }

      // assistant: bars grow down from the center line
      ctx.fillStyle = assistantColor;
      for (let i = 0; i < BUFFER_LENGTH; i++) {
        const v = dataArrayOutput[i] / 255;
        const barHeight = Math.min(v * (h / 2) * 1.5, h / 2);
        ctx.fillRect(i * barWidth, h / 2, barWidth - gap, barHeight);
      }

      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = lineColor;
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [inputAnalyser, outputAnalyser, height, colorUser, colorAssistant, delimiterColor]);

  return <canvas ref={canvasRef} className={["katechat-audio-visualizer", className || ""].join(" ")} />;
};

AudioVisualizer.displayName = "AudioVisualizer";
