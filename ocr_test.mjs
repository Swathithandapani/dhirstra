import * as pdfjsLib from './node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { pathToFileURL, fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
).href;

const buf = readFileSync('src/backend/uploads/1775412911982-DPR_compressed.pdf');
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
console.log('Pages:', pdf.numPages);

// Render page 1 to canvas and save as PNG for inspection
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 1.5 });
const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext('2d');
await page.render({ canvasContext: ctx, viewport }).promise;
const pngBuf = canvas.toBuffer('image/png');
writeFileSync('page1_preview.png', pngBuf);
console.log('Saved page1_preview.png', viewport.width, 'x', viewport.height);
