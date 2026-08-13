// Bundle the on-device OCR assets into public/ocr/ so the Import Day photo
// workflow works fully offline (no CDN) behind a locked-down clinic network.
//
// Copies the tesseract.js worker and WASM core from node_modules and fetches the
// English language data, gzipping it to eng.traineddata.gz. Then build the app
// with VITE_OCR_ASSETS=/ocr/ so the client loads these instead of the CDN.
//
// Usage:
//   npm install            # ensure tesseract.js + tesseract.js-core are present
//   npm run fetch:ocr      # populate public/ocr/
//   VITE_OCR_ASSETS=/ocr/ npm run build
//
// The language data defaults to the tessdata_fast English model on GitHub. Set
// OCR_TRAINEDDATA_URL to override, or OCR_TRAINEDDATA_FILE to use a local file
// (useful on networks that proxy outbound HTTPS).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, readdir, copyFile, readFile, writeFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "ocr");

const TRAINEDDATA_URL =
  process.env.OCR_TRAINEDDATA_URL ||
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata";

async function main() {
  await mkdir(OUT, { recursive: true });

  // 1) Worker.
  const workerSrc = require.resolve("tesseract.js/dist/worker.min.js");
  await copyFile(workerSrc, join(OUT, "worker.min.js"));
  console.log("copied worker.min.js");

  // 2) WASM core (all variants — the loader picks SIMD/relaxed at runtime).
  const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));
  const coreFiles = (await readdir(coreDir)).filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f));
  for (const f of coreFiles) await copyFile(join(coreDir, f), join(OUT, f));
  console.log(`copied ${coreFiles.length} core files`);

  // 3) Language data -> eng.traineddata.gz.
  let raw;
  if (process.env.OCR_TRAINEDDATA_FILE) {
    raw = await readFile(process.env.OCR_TRAINEDDATA_FILE);
    console.log(`read eng.traineddata from ${process.env.OCR_TRAINEDDATA_FILE} (${raw.length} bytes)`);
  } else {
    const res = await fetch(TRAINEDDATA_URL);
    if (!res.ok) throw new Error(`fetch ${TRAINEDDATA_URL} -> HTTP ${res.status}`);
    raw = Buffer.from(await res.arrayBuffer());
    console.log(`downloaded eng.traineddata (${raw.length} bytes)`);
  }
  await writeFile(join(OUT, "eng.traineddata.gz"), gzipSync(raw));
  console.log("wrote eng.traineddata.gz");

  const total = (await readdir(OUT)).length;
  const sz = (await stat(join(OUT, "eng.traineddata.gz"))).size;
  console.log(`\nOCR assets ready in public/ocr/ (${total} files, lang ${(sz / 1e6).toFixed(1)} MB).`);
  console.log("Build with:  VITE_OCR_ASSETS=/ocr/ npm run build");
}

main().catch((e) => { console.error(e); process.exit(1); });
