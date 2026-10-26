// Separate every delivery note in one photo with SAM 3.1 and straighten each one.
// SAM gives a pixel mask per note; code finds its minimum rotated rectangle, rotates the crop upright
// and whitens what is outside the mask. If SAM finds nothing, the whole photo is one note.
import type OpenAI from "openai";
import sharp from "sharp";
import { decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { assertAllowedModel, MODELS } from "./meta/models";
import { metaClient } from "./albaran/read";

export const PROMPTS_SAM = ["sheet of paper", "document"] as const;

export interface Documento {
  docId: string;
  /** Straightened JPEG of this note (what the reader sees). */
  jpeg: Buffer;
  width: number;
  height: number;
  /** Where it was in the photo: rotated rectangle (pixels of the photo) and outline for the overlay. */
  enFoto: { cx: number; cy: number; w: number; h: number; angulo: number; caja: { x: number; y: number; w: number; h: number }; contornoSVG: string | null };
  confianza: number | null;
}

export interface Segmentacion {
  foto: { width: number; height: number };
  prompt: string | null;
  documentos: Documento[];
  ms: number;
}

type P = { x: number; y: number };

function convexHull(pts: P[]): P[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: P[] = [];
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Minimum-area rectangle around a convex hull (rotating calipers over hull edges). */
export function minAreaRect(hull: P[]) {
  let best = { area: Infinity, cx: 0, cy: 0, w: 0, h: 0, angulo: 0 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const th = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(th), s = Math.sin(th);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const q of hull) {
      const u = q.x * c + q.y * s, v = -q.x * s + q.y * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      const uc = (minU + maxU) / 2, vc = (minV + maxV) / 2;
      best = { area, cx: uc * c - vc * s, cy: uc * s + vc * c, w: maxU - minU, h: maxV - minV, angulo: (th * 180) / Math.PI };
    }
  }
  // Normalise to the smallest rotation (|angle| ≤ 45°), swapping sides when needed.
  let { angulo, w, h } = best;
  while (angulo > 45) { angulo -= 90; [w, h] = [h, w]; }
  while (angulo < -45) { angulo += 90; [w, h] = [h, w]; }
  return { cx: best.cx, cy: best.cy, w, h, angulo };
}

const iou = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
};

export async function segmentar(foto: Buffer, opts: { client?: OpenAI; longSide?: number } = {}): Promise<Segmentacion> {
  const t0 = Date.now();
  const client = opts.client ?? metaClient();
  assertAllowedModel(MODELS.segment);
  const base = await sharp(foto).rotate().resize({ width: opts.longSide ?? 2400, height: opts.longSide ?? 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const { width: W = 0, height: H = 0 } = await sharp(base).metadata();
  const raw = await sharp(base).raw().toBuffer({ resolveWithObject: true });

  for (const prompt of PROMPTS_SAM) {
    const stream = await client.responses.create({
      model: MODELS.segment,
      stream: true,
      metadata: { include_confidence: "true" },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:image/jpeg;base64,${base.toString("base64")}`, detail: "auto" }] }],
    });
    const result = await parseImageStream(stream).finalResult;
    const masks = recordsOfKind(result.records, "mask")
      .map((m) => ({ m, caja: { x: m.bounds.left, y: m.bounds.top, w: m.bounds.right - m.bounds.left, h: m.bounds.bottom - m.bounds.top } }))
      .filter(({ m, caja }) => (caja.w * caja.h) / (W * H) >= 0.04 && (m.confidence ?? 1) >= 0.5)
      .sort((a, b) => (b.m.confidence ?? 0) - (a.m.confidence ?? 0));
    const kept: typeof masks = [];
    for (const x of masks) if (!kept.some((k) => iou(k.caja, x.caja) > 0.5)) kept.push(x);
    if (!kept.length) continue;
    // Reading order: top-to-bottom rows, then left-to-right.
    kept.sort((a, b) => (Math.abs(a.caja.y - b.caja.y) > H * 0.15 ? a.caja.y - b.caja.y : a.caja.x - b.caja.x));
    const documentos = await Promise.all(kept.map(({ m, caja }, i) => enderezar(`doc${i + 1}`, m, caja, raw, W, H)));
    return { foto: { width: W, height: H }, prompt, documentos, ms: Date.now() - t0 };
  }
  // Nothing found: the whole photo is one note.
  return {
    foto: { width: W, height: H },
    prompt: null,
    documentos: [{ docId: "doc1", jpeg: base, width: W, height: H, enFoto: { cx: W / 2, cy: H / 2, w: W, h: H, angulo: 0, caja: { x: 0, y: 0, w: W, h: H }, contornoSVG: null }, confianza: null }],
    ms: Date.now() - t0,
  };
}

type MaskRecord = Parameters<typeof decodeMaskToRaster>[0] extends infer M ? { mask: M & { width: number; height: number }; confidence?: number } : never;

async function enderezar(
  docId: string,
  m: MaskRecord,
  caja: { x: number; y: number; w: number; h: number },
  raw: { data: Buffer; info: { width: number; height: number; channels: number } },
  W: number,
  H: number,
): Promise<Documento> {
  const r = decodeMaskToRaster(m.mask);
  const mw = m.mask.width, mh = m.mask.height;
  const sx = caja.w / mw, sy = caja.h / mh;
  // Boundary pixels of the mask, in photo coordinates.
  const pts: P[] = [];
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      if (!r[y * mw + x]) continue;
      const borde = x === 0 || y === 0 || x === mw - 1 || y === mh - 1 || !r[y * mw + x - 1] || !r[y * mw + x + 1] || !r[(y - 1) * mw + x] || !r[(y + 1) * mw + x];
      if (borde) pts.push({ x: caja.x + (x + 0.5) * sx, y: caja.y + (y + 0.5) * sy });
    }
  const rect = minAreaRect(convexHull(pts));

  // Whiten everything outside the mask inside the crop window, then rotate upright and cut the rectangle.
  const pad = Math.ceil(Math.max(rect.w, rect.h) * 0.04);
  const wx = Math.max(0, Math.floor(caja.x - pad)), wy = Math.max(0, Math.floor(caja.y - pad));
  const ww = Math.min(W - wx, Math.ceil(caja.w + 2 * pad)), wh = Math.min(H - wy, Math.ceil(caja.h + 2 * pad));
  const ch = raw.info.channels;
  const crop = Buffer.alloc(ww * wh * 3, 255);
  for (let y = 0; y < wh; y++)
    for (let x = 0; x < ww; x++) {
      const px = wx + x, py = wy + y;
      const mx = Math.floor((px - caja.x) / sx), my = Math.floor((py - caja.y) / sy);
      if (mx < 0 || my < 0 || mx >= mw || my >= mh || !r[my * mw + mx]) continue;
      const si = (py * W + px) * ch, di = (y * ww + x) * 3;
      crop[di] = raw.data[si]; crop[di + 1] = raw.data[si + 1]; crop[di + 2] = raw.data[si + 2];
    }
  const rotated = await sharp(crop, { raw: { width: ww, height: wh, channels: 3 } }).rotate(-rect.angulo, { background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const RW = rotated.info.width, RH = rotated.info.height;
  // Rectangle centre after rotation (rotation about the crop centre, canvas grown symmetrically).
  const a = (-rect.angulo * Math.PI) / 180;
  const dx = rect.cx - (wx + ww / 2), dy = rect.cy - (wy + wh / 2);
  const ncx = RW / 2 + dx * Math.cos(a) - dy * Math.sin(a), ncy = RH / 2 + dx * Math.sin(a) + dy * Math.cos(a);
  const left = Math.max(0, Math.round(ncx - rect.w / 2)), top = Math.max(0, Math.round(ncy - rect.h / 2));
  const cw = Math.min(RW - left, Math.round(rect.w)), chh = Math.min(RH - top, Math.round(rect.h));
  const jpeg = await sharp(rotated.data, { raw: { width: RW, height: RH, channels: 3 } }).extract({ left, top, width: Math.max(1, cw), height: Math.max(1, chh) }).jpeg({ quality: 90 }).toBuffer();
  const path = decodeMaskToSVGPath(m.mask);
  return {
    docId,
    jpeg,
    width: Math.max(1, cw),
    height: Math.max(1, chh),
    enFoto: { ...rect, caja, contornoSVG: path ? `<path transform="translate(${caja.x} ${caja.y}) scale(${sx} ${sy})" d="${path}"/>` : null },
    confianza: m.confidence ?? null,
  };
}
