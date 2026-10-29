"use client";
import { useEffect, useRef, useState } from "react";
export function Waveform({ stream }: { stream: MediaStream }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let context: AudioContext | undefined,
      source: MediaStreamAudioSourceNode | undefined;
    let frame = 0,
      disposed = false;
    const fail = () => {
      if (!disposed) setUnavailable(true);
    };
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const draw = () => {
        if (disposed) return;
        const element = canvas.current,
          pen = element?.getContext("2d");
        if (!element || !pen) {
          fail();
          return;
        }
        const { width, height } = element.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        if (
          element.width !== Math.round(width * ratio) ||
          element.height !== Math.round(height * ratio)
        ) {
          element.width = Math.round(width * ratio);
          element.height = Math.round(height * ratio);
        }
        analyser.getFloatTimeDomainData(samples);
        pen.clearRect(0, 0, element.width, element.height);
        pen.strokeStyle = getComputedStyle(element).color;
        pen.lineWidth = 2 * ratio;
        pen.beginPath();
        samples.forEach((sample, i) => {
          const x = (i / (samples.length - 1)) * element.width;
          const y = (0.5 - sample * 0.45) * element.height;
          if (i === 0) pen.moveTo(x, y);
          else pen.lineTo(x, y);
        });
        pen.stroke();
        frame = requestAnimationFrame(draw);
      };
      void context
        .resume()
        .then(() => {
          if (!disposed) draw();
        })
        .catch(fail);
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      source?.disconnect();
      void context?.close().catch(() => {});
    };
  }, [stream]);
  return unavailable ? (
    <p role="status">Live waveform unavailable. Audio is still recording.</p>
  ) : (
    <canvas
      ref={canvas}
      aria-label="Live microphone waveform"
      role="img"
      style={{ width: "100%", height: 90, color: "#95664b" }}
    />
  );
}
