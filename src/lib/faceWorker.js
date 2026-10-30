// Runs in a Web Worker: finds faces (YuNet) and turns each face into 128 numbers (SFace).
import * as ort from "onnxruntime-web/wasm";

const MAX_SIDE = 1600;        // photos are shrunk to this size before looking for faces
const MIN_SCORE = 0.8;        // face detector confidence
const MIN_FACE_PX = 24;       // smaller faces are too blurry to recognise
const NMS_IOU = 0.3;
const PREVIEW_SIDE = 720;
// Where the eyes, nose and mouth corners should land in the 112x112 face SFace expects.
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

let detector, recognizer;

async function init(base) {
  ort.env.wasm.wasmPaths = `${base}ort/`;
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "error";
  const opts = { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 };
  [detector, recognizer] = await Promise.all([
    ort.InferenceSession.create(`${base}models/face_detection_yunet.onnx`, opts),
    ort.InferenceSession.create(`${base}models/face_recognition_sface.onnx`, opts),
  ]);
}

async function loadBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(blob);
  }
}

function toTensor(data, w, h, bgr) {
  const plane = w * h, out = new Float32Array(3 * plane);
  const [c0, c2] = bgr ? [2, 0] : [0, 2];
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    out[i] = data[p + c0];
    out[plane + i] = data[p + 1];
    out[2 * plane + i] = data[p + c2];
  }
  return new ort.Tensor("float32", out, [1, 3, h, w]);
}

async function detect(canvas) {
  const { width: W, height: H } = canvas;
  const PW = Math.ceil(W / 32) * 32, PH = Math.ceil(H / 32) * 32;
  const padded = new OffscreenCanvas(PW, PH);
  const ctx = padded.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, PW, PH);
  ctx.drawImage(canvas, 0, 0);
  const input = toTensor(ctx.getImageData(0, 0, PW, PH).data, PW, PH, true);
  const out = await detector.run({ input });

  const found = [];
  for (const stride of [8, 16, 32]) {
    const cols = PW / stride, rows = PH / stride;
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data;
    const box = out[`bbox_${stride}`].data, kps = out[`kps_${stride}`].data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
        if (score < MIN_SCORE) continue;
        const cx = (c + box[i * 4]) * stride, cy = (r + box[i * 4 + 1]) * stride;
        const w = Math.exp(box[i * 4 + 2]) * stride, h = Math.exp(box[i * 4 + 3]) * stride;
        const points = [];
        for (let n = 0; n < 5; n++) points.push([(kps[i * 10 + 2 * n] + c) * stride, (kps[i * 10 + 2 * n + 1] + r) * stride]);
        found.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, points });
      }
    }
  }
  return nms(found).filter(f => Math.min(f.w, f.h) >= MIN_FACE_PX);
}

function nms(faces) {
  faces.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const f of faces) {
    if (kept.every(k => iou(k, f) <= NMS_IOU)) kept.push(f);
  }
  return kept;
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

// Least-squares similarity transform (rotation + scale + shift) from the 5 face points to TEMPLATE.
function similarity(points) {
  let n = 0, sx = 0, sy = 0, su = 0, sv = 0, sxx = 0, sxu = 0, syv = 0, sxv = 0, syu = 0;
  points.forEach(([x, y], i) => {
    const [u, v] = TEMPLATE[i];
    n++; sx += x; sy += y; su += u; sv += v;
    sxx += x * x + y * y; sxu += x * u; syv += y * v; sxv += x * v; syu += y * u;
  });
  const mx = sx / n, my = sy / n, mu = su / n, mv = sv / n;
  const varS = sxx / n - mx * mx - my * my;
  const a = ((sxu + syv) / n - (mx * mu + my * mv)) / varS;
  const b = ((sxv - syu) / n - (mx * mv - my * mu)) / varS;
  return { a, b, tx: mu - a * mx + b * my, ty: mv - b * mx - a * my };
}

async function embed(canvas, face) {
  const { a, b, tx, ty } = similarity(face.points);
  const aligned = new OffscreenCanvas(112, 112);
  const ctx = aligned.getContext("2d");
  ctx.setTransform(a, b, -b, a, tx, ty);
  ctx.drawImage(canvas, 0, 0);
  const input = toTensor(ctx.getImageData(0, 0, 112, 112).data, 112, 112, false);
  const out = await recognizer.run({ data: input });
  const v = Float32Array.from(out.fc1.data);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  return v.map(x => x / norm);
}

async function crop(canvas, face) {
  const pad = Math.max(face.w, face.h) * 0.35;
  const x = Math.max(0, face.x - pad), y = Math.max(0, face.y - pad);
  const w = Math.min(canvas.width, face.x + face.w + pad) - x, h = Math.min(canvas.height, face.y + face.h + pad) - y;
  const out = new OffscreenCanvas(160, Math.max(1, Math.round(160 * h / w)));
  out.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return out.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

async function scaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function processPhoto(blob) {
  const bitmap = await loadBitmap(blob);
  const canvas = await scaled(bitmap, MAX_SIDE);
  const preview = await (await scaled(bitmap, PREVIEW_SIDE)).convertToBlob({ type: "image/jpeg", quality: 0.8 });
  bitmap.close();
  const faces = [];
  for (const face of await detect(canvas)) {
    faces.push({ embedding: await embed(canvas, face), crop: await crop(canvas, face) });
  }
  return { faces, preview };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "init") {
      await init(data.base);
      self.postMessage({ id, ok: true });
    } else if (type === "process") {
      self.postMessage({ id, ok: true, result: await processPhoto(data.blob) });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
