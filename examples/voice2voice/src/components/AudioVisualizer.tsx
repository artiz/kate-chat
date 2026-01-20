import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  width?: number;
  height?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  inputAnalyser,
  outputAnalyser,
  width = 300,
  height = 100,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const bufferLength = 32; // Low number for "bars" look
    const dataArrayInput = new Uint8Array(bufferLength);
    const dataArrayOutput = new Uint8Array(bufferLength);

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Draw Input (Microphone) - Left Side / Top / Green
      if (inputAnalyser) {
        // Use getByteFrequencyData for spectrum
        inputAnalyser.getByteFrequencyData(dataArrayInput);
      } else {
        dataArrayInput.fill(0);
      }

      // Draw Output (AI) - Right Side / Bottom / Blue
      if (outputAnalyser) {
        outputAnalyser.getByteFrequencyData(dataArrayOutput);
      } else {
        dataArrayOutput.fill(0);
      }

      // Visual style: Center mirrored bars
      // Input (User) = Blue-ish
      // Output (AI) = Purple-ish

      const barWidth = w / bufferLength;

      // We'll overlay them or stack them?
      // Let's do a circle or simple bars. Simple bars for now.
      // Top half: User, Bottom half: AI

      // Draw User
      ctx.fillStyle = "#FF922B"; // Orange 5
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArrayInput[i] / 255;
        const barHeight = v * (h / 2) * 1.5; // Scale up a bit
        const x = i * barWidth;
        const y = h / 2 - barHeight;

        ctx.fillRect(x, y, barWidth - 2, barHeight);
      }

      // Draw AI
      ctx.fillStyle = "#FD7E14"; // Orange 6
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArrayOutput[i] / 255;
        const barHeight = v * (h / 2) * 1.5;
        const x = i * barWidth;
        const y = h / 2;

        ctx.fillRect(x, y, barWidth - 2, barHeight);
      }

      // Draw center line
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [inputAnalyser, outputAnalyser]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="audio-visualizer"
    />
  );
};
