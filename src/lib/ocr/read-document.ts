"use client";

/** A PDF longer than this is not read: receipts and notes have a page or two. */
export const MAX_PDF_PAGES = 5;

export type OcrProgress = (percent: number) => void;

async function readImage(file: File, onProgress?: OcrProgress): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    gzip: true,
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** The text layer of a PDF, line by line. A scanned PDF has none, and the person is asked for a photo instead. */
async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  try {
    const pages = Math.min(document.numPages, MAX_PDF_PAGES);
    let text = "";
    for (let number = 1; number <= pages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str + (item.hasEOL ? "\n" : " ");
        }
      }
      text += "\n";
    }
    if (text.replace(/\s/g, "").length < 20) {
      throw new Error("scanned_pdf");
    }
    return text;
  } finally {
    await task.destroy();
  }
}

/** Reads the text of a photo, a print or a PDF, here on the device: the file is not sent anywhere to be read. */
export async function readDocumentText(file: File, onProgress?: OcrProgress): Promise<string> {
  return file.type === "application/pdf" ? readPdf(file) : readImage(file, onProgress);
}
