// The proof that goes with a claim: one image, drawn in the browser, with each claimed line cut from
// the supplier's own paper, marked with the highlighter, and the code's arithmetic under it. The
// supplier can check it in seconds without trusting anyone's word, including ours.
import type { Aviso } from "../checks/types";
import type { DocEstado } from "./estado";
import { formatCents } from "../numbers";
import { calculo, conDinero } from "../reclamacion";
import type { Idioma } from "./textos";

const W = 1080, PAD = 48, CW = W - 2 * PAD;
const COLOR = { papel: "#f3efe6", tinta: "#1b1712", tinta2: "#4a433a", apagado: "#6f675b", linea: "#d8d0c1", rojo: "#c2362b", rotulador: "rgba(255, 228, 92, 0.55)", sello: "#1e4fa8" };

function fuente(variable: string, alternativa: string) {
  if (typeof document === "undefined") return alternativa;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${alternativa}` : alternativa;
}

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
}

function partir(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const p of texto.split(" ")) {
    const t = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(t).width > ancho && linea) { out.push(linea); linea = p; } else linea = t;
  }
  if (linea) out.push(linea);
  return out;
}

const fechaCorta = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export interface Pieza { aviso: Aviso; titulo: string; recorte: { sx: number; sy: number; sw: number; sh: number; fila: { y: number; h: number } } | null; calculo: string; extra?: string }

/** What goes in the image, computed from the session: crop rectangles in the paper's pixels. */
export function piezas(d: DocEstado, lang: Idioma): Pieza[] {
  const es = lang === "es";
  const iw = d.width ?? 0, ih = d.height ?? 0;
  const evs = [...(d.investigacion?.evidencias ?? []), ...(d.expediente?.evidencias ?? [])];
  return conDinero(d.avisos).map((a) => {
    const l = a.lineaIdx != null ? d.leido?.lineas[a.lineaIdx] : undefined;
    const titulo = l ? `${es ? "Línea" : "Line"} ${a.lineaIdx! + 1} · ${l.descripcion.texto ?? ""}` : es ? "Albarán completo" : "Whole note";
    let recorte: Pieza["recorte"] = null;
    const c = l?.caja_fila;
    if (c && iw && ih) {
      const y0 = (c.y_min / 1000) * ih, y1 = (c.y_max / 1000) * ih, hFila = Math.max(8, y1 - y0);
      // Show the whole rows above and below (context the supplier recognises), or 1.2 rows of margin.
      const filas = d.leido?.lineas ?? [];
      const arriba = filas[a.lineaIdx! - 1]?.caja_fila, abajo = filas[a.lineaIdx! + 1]?.caja_fila;
      const top = arriba && arriba.y_max <= c.y_min ? (arriba.y_min / 1000) * ih - 0.25 * hFila : y0 - 1.2 * hFila;
      const bottom = abajo && abajo.y_min >= c.y_max ? (abajo.y_max / 1000) * ih + 0.25 * hFila : y1 + 1.2 * hFila;
      const sy = Math.max(0, top), sh = Math.min(ih - sy, bottom - sy);
      const sx = Math.max(0, (c.x_min / 1000) * iw - 0.02 * iw), sw = Math.min(iw - sx, ((c.x_max - c.x_min) / 1000) * iw + 0.04 * iw);
      recorte = { sx, sy, sw, sh, fila: { y: y0 - sy, h: hFila } };
    }
    let extra: string | undefined;
    if (a.codigo === "SUBIDA") {
      const reg = evs.find((e) => e.id === a.datos.registro);
      const compras = ((reg?.datos?.compras as { fecha: string; precioUnit: number }[] | undefined) ?? []).slice(-5);
      if (compras.length) extra = `${es ? "Compras anteriores" : "Previous purchases"}: ${compras.map((x) => `${fechaCorta(x.fecha)} ${formatCents(Math.round(x.precioUnit * 100), lang)}`).join(" · ")}`;
    }
    return { aviso: a, titulo, recorte, calculo: calculo(a, lang), extra };
  });
}

/** Draw the proof image. Returns a PNG blob. */
export async function imagenPrueba(d: DocEstado, lang: Idioma): Promise<Blob | null> {
  if (!d.imagen) return null;
  const es = lang === "es";
  const ps = piezas(d, lang);
  if (!ps.length) return null;
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
  const papel = await cargar(d.imagen);
  const serif = fuente("--font-fraunces", "Georgia, serif"), sans = fuente("--font-inter", "system-ui, sans-serif");

  const medida = document.createElement("canvas").getContext("2d")!;
  // Layout first (heights depend on wrapped text and crop aspect ratios), then draw.
  type Bloque = { p: Pieza; alto: number; hImg: number; calc: string[]; extra: string[] };
  medida.font = `500 24px ${sans}`;
  const bloques: Bloque[] = ps.map((p) => {
    const hImg = p.recorte ? Math.round((p.recorte.sh / p.recorte.sw) * CW) : 0;
    const calc = partir(medida, p.calculo, CW);
    const extra = p.extra ? partir(medida, p.extra, CW) : [];
    return { p, hImg, calc, extra, alto: 44 + (hImg ? hImg + 20 : 0) + calc.length * 34 + extra.length * 32 + 36 };
  });
  const cabecera = 196, pie = 150;
  const H = cabecera + bloques.reduce((s, b) => s + b.alto, 0) + pie;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = COLOR.papel; ctx.fillRect(0, 0, W, H);

  // Header: who, which note.
  ctx.fillStyle = COLOR.apagado; ctx.font = `600 20px ${sans}`;
  ctx.fillText((es ? "PRUEBA DE LA RECLAMACIÓN" : "CLAIM EVIDENCE").split("").join(String.fromCharCode(8202)), PAD, PAD + 16);
  ctx.fillStyle = COLOR.tinta; ctx.font = `600 42px ${serif}`;
  ctx.fillText(d.proveedor ?? (es ? "Proveedor" : "Supplier"), PAD, PAD + 70);
  const f = d.fecha ? d.fecha.split("-").reverse().join("/") : "";
  ctx.fillStyle = COLOR.tinta2; ctx.font = `400 26px ${sans}`;
  ctx.fillText(`${es ? "Albarán nº" : "Delivery note no."} ${d.numero ?? "-"}${f ? ` · ${f}` : ""}`, PAD, PAD + 110);
  ctx.fillStyle = COLOR.linea; ctx.fillRect(PAD, cabecera - 22, CW, 2);

  let y = cabecera + 16;
  for (const b of bloques) {
    const { p } = b;
    ctx.fillStyle = COLOR.tinta; ctx.font = `600 26px ${sans}`;
    const importe = `+${formatCents(p.aviso.centimos, lang)}`;
    ctx.font = `600 34px ${serif}`;
    const wImp = ctx.measureText(importe).width;
    ctx.fillStyle = COLOR.rojo; ctx.fillText(importe, W - PAD - wImp, y + 24);
    ctx.fillStyle = COLOR.tinta; ctx.font = `600 26px ${sans}`;
    ctx.fillText(partir(ctx, p.titulo, CW - wImp - 24)[0], PAD, y + 22);
    y += 44;
    if (p.recorte && b.hImg) {
      const r = p.recorte;
      ctx.save();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(PAD, y, CW, b.hImg);
      ctx.drawImage(papel, r.sx, r.sy, r.sw, r.sh, PAD, y, CW, b.hImg);
      const k = CW / r.sw;
      // The highlighter on the claimed row, under the ink (multiply), and a red frame.
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = COLOR.rotulador;
      ctx.fillRect(PAD + 4, y + r.fila.y * k - 4, CW - 8, r.fila.h * k + 8);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = COLOR.rojo; ctx.lineWidth = 3;
      ctx.strokeRect(PAD + 2, y + r.fila.y * k - 6, CW - 4, r.fila.h * k + 12);
      ctx.strokeStyle = COLOR.linea; ctx.lineWidth = 1;
      ctx.strokeRect(PAD + 0.5, y + 0.5, CW - 1, b.hImg - 1);
      ctx.restore();
      y += b.hImg + 20;
    }
    ctx.fillStyle = COLOR.tinta; ctx.font = `500 24px ${sans}`;
    for (const t of b.calc) { ctx.fillText(t, PAD, y + 22); y += 34; }
    ctx.fillStyle = COLOR.tinta2; ctx.font = `400 22px ${sans}`;
    for (const t of b.extra) { ctx.fillText(t, PAD, y + 20); y += 32; }
    y += 36;
  }

  // Footer: the total, and how it was checked.
  ctx.fillStyle = COLOR.linea; ctx.fillRect(PAD, y - 8, CW, 2);
  const total = ps.reduce((s, p) => s + p.aviso.centimos, 0);
  ctx.fillStyle = COLOR.tinta; ctx.font = `500 26px ${sans}`;
  ctx.fillText(es ? "Total reclamado" : "Total claimed", PAD, y + 40);
  ctx.fillStyle = COLOR.rojo; ctx.font = `600 40px ${serif}`;
  const tt = formatCents(total, lang);
  ctx.fillText(tt, W - PAD - ctx.measureText(tt).width, y + 44);
  ctx.fillStyle = COLOR.apagado; ctx.font = `400 20px ${sans}`;
  const releidas = ps.every((p) => p.aviso.datos.evidencia != null);
  ctx.fillText(es ? `Cada línea, cortada de vuestro albarán${releidas ? " y releída ampliada" : ""}. Comprobado con Conforme.` : `Each line cut from your own note${releidas ? " and re-read zoomed in" : ""}. Checked with Conforme.`, PAD, y + 92);

  return await new Promise((ok) => cv.toBlob((b) => ok(b), "image/png"));
}
