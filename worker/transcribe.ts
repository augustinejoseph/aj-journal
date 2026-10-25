import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
env.useBrowserCache = true;
type ASR = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<ASR>;
let transcriber: ASR | undefined;
self.onmessage = async (event: MessageEvent<{ audio: Float32Array }>) => {
  try {
    const progress_callback = (p: unknown) =>
      self.postMessage({ type: "progress", progress: p });
    if (!transcriber) {
      try {
        if (!("gpu" in navigator)) throw new Error("No WebGPU");
        transcriber = await createPipeline(
          "automatic-speech-recognition",
          "onnx-community/whisper-small",
          { device: "webgpu", dtype: "q8", progress_callback },
        );
      } catch {
        transcriber = await createPipeline(
          "automatic-speech-recognition",
          "onnx-community/whisper-small",
          { device: "wasm", dtype: "q8", progress_callback },
        );
      }
    }
    const result = await transcriber(event.data.audio, {
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });
    self.postMessage({
      type: "complete",
      text: Array.isArray(result)
        ? result.map((r) => r.text).join(" ")
        : result.text,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      error:
        error instanceof Error
          ? error.message
          : "Transcription failed. Retry on a capable desktop.",
    });
  }
};
