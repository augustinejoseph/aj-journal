export async function transcribe(
  blob: Blob,
  onProgress: (s: string) => void,
): Promise<string> {
  const context = new AudioContext({ sampleRate: 16000 });
  let samples: Float32Array;
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    samples = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const channel = audio.getChannelData(c);
      for (let i = 0; i < audio.length; i++)
        samples[i] += channel[i] / audio.numberOfChannels;
    }
  } finally {
    await context.close();
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../worker/transcribe.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e) => {
      if (e.data.type === "complete") {
        worker.terminate();
        resolve(e.data.text);
      } else if (e.data.type === "error") {
        worker.terminate();
        reject(new Error(e.data.error));
      } else {
        onProgress("Loading / running Whisper Small. Keep this tab open.");
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new Error(
          "Worker failed or ran out of memory. Audio is safe; retry on desktop.",
        ),
      );
    };
    worker.postMessage({ audio: samples }, [samples.buffer]);
  });
}
