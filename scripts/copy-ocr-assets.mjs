// Copies what the browser needs to read documents (the OCR engine, the Portuguese language data and
// the PDF reader) into public/ocr, so nothing is fetched from another site. Runs after npm install.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const modules = "node_modules";
const target = join("public", "ocr");

if (!existsSync(join(modules, "tesseract.js"))) {
  process.exit(0);
}

mkdirSync(join(target, "core"), { recursive: true });
mkdirSync(join(target, "lang"), { recursive: true });

cpSync(join(modules, "tesseract.js", "dist", "worker.min.js"), join(target, "worker.min.js"));
for (const file of readdirSync(join(modules, "tesseract.js-core"))) {
  // Only the engine builds that read text with the neural network; each comes as one script that carries the wasm inside.
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(file)) {
    cpSync(join(modules, "tesseract.js-core", file), join(target, "core", file));
  }
}
cpSync(join(modules, "@tesseract.js-data", "por", "4.0.0_best_int", "por.traineddata.gz"), join(target, "lang", "por.traineddata.gz"));
cpSync(join(modules, "pdfjs-dist", "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
