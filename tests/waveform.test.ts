import { afterEach, beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => (() => void) | void)[],
  canvas: null as unknown,
  setState: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => ({ current: hooks.canvas }),
  useState: () => [false, hooks.setState],
  useEffect: (effect: () => (() => void) | void) => hooks.effects.push(effect),
}));
import { Waveform } from "../components/waveform";
beforeEach(() => {
  hooks.effects = [];
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
it("uses actual input amplitude and releases analyser resources without stopping the recording stream", async () => {
  const pen = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
  };
  const canvas = {
    width: 300,
    height: 90,
    getBoundingClientRect: () => ({ width: 300, height: 90 }),
    getContext: () => pen,
  };
  hooks.canvas = canvas;
  let amplitude = 0;
  const analyser = {
    fftSize: 2048,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const close = vi.fn().mockResolvedValue(undefined);
  class Context {
    createAnalyser() {
      return analyser;
    }
    createMediaStreamSource() {
      return source;
    }
    resume() {
      return Promise.resolve();
    }
    close = close;
  }
  let nextFrame: (() => void) | undefined;
  const cancel = vi.fn(),
    stopTrack = vi.fn();
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("getComputedStyle", () => ({ color: "brown" }));
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    nextFrame = callback;
    return 123;
  });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  Waveform({
    stream: {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream,
  });
  const cleanup = hooks.effects[0]();
  await Promise.resolve();
  expect(source.connect).toHaveBeenCalledWith(analyser);
  expect(pen.moveTo).toHaveBeenLastCalledWith(0, 45);
  expect(pen.lineTo.mock.calls.every(([, y]) => y === 45)).toBe(true);
  amplitude = 0.1;
  nextFrame!();
  const quietY = pen.moveTo.mock.lastCall![1];
  amplitude = 0.8;
  nextFrame!();
  expect(Math.abs(pen.moveTo.mock.lastCall![1] - 45)).toBeGreaterThan(
    Math.abs(quietY - 45),
  );
  cleanup!();
  expect(cancel).toHaveBeenCalledWith(123);
  expect(source.disconnect).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(stopTrack).not.toHaveBeenCalled();
});
it("reports unavailable visualization without interrupting recording", () => {
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        throw new Error("unavailable");
      }
    },
  );
  const stopTrack = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Waveform({
    stream: {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream,
  });
  const cleanup = hooks.effects[0]();
  expect(hooks.setState).toHaveBeenCalledWith(true);
  expect(stopTrack).not.toHaveBeenCalled();
  cleanup!();
});
