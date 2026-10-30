// Copies the ONNX Runtime WebAssembly files into public/ort so the app serves them itself.
import { copyFileSync, mkdirSync } from "node:fs";

const files = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
mkdirSync("public/ort", { recursive: true });
for (const f of files) copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
console.log("Copied ONNX Runtime files to public/ort");
