import { createWorker } from "tesseract.js";
export async function scanReceipt(
  image: string,
  onProgress: (progress: number) => void,
) {
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
