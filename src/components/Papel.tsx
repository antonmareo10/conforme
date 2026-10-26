"use client";
// One delivery note on screen: the straightened paper, a highlighter stroke per line read,
// money pins where the problems are, the rubber stamp, and the "lights up where you tapped" focus.
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { forwardRef } from "react";
import type { Caja } from "@/lib/albaran/schema";
import type { DocEstado } from "@/lib/sesion/estado";
import { SELLO, type Idioma } from "@/lib/sesion/textos";
import { formatCents } from "@/lib/numbers";

export interface Foco {
  docId: string;
  cajas: Caja[];
}

const pad = (c: Caja, px = 6, py = 10): Caja => ({ x_min: c.x_min - px, y_min: c.y_min - py, x_max: c.x_max + px, y_max: c.y_max + py });

/**
 * Where the stamp can land without covering what was read: a search over the paper for the spot
 * that overlaps the fewest read boxes, as close as possible to the total's row (where a stamp
 * goes, by the signature). The stamp is sized in container units, so its footprint on the 0-1000 grid is known.
 */
const SELLO_EM = 0.034; // font size as a share of the paper's width (3.4cqw)
function sitioSello(leido: DocEstado["leido"], texto: string, aspecto: number): { x: number; y: number } {
  const w = Math.min(940, (texto.length * 0.84 + 1.6) * SELLO_EM * 1000);
  const h = 2.1 * SELLO_EM * 1000 * aspecto; // aspecto = paper width / height
  if (!leido) return { x: 1000 - w / 2 - 40, y: 900 };
  const cajas = [
    ...leido.lineas.map((l) => l.caja_fila),
    leido.total.caja, leido.proveedor.caja, leido.numero.caja, leido.fecha.caja, leido.nif_proveedor.caja,
    ...leido.impuestos.flatMap((t) => [t.base.caja, t.cuota.caja, t.iva_pct.caja]),
  ].filter((c): c is Caja => !!c && c.y_max > c.y_min);
  // Next to the total, like a stamp by the signature line; else below everything that was read.
  const t = leido.total.caja && leido.total.caja.y_max > leido.total.caja.y_min ? leido.total.caja : null;
  const yObjetivo = t ? (t.y_min + t.y_max) / 2 : Math.min(1000 - h / 2 - 40, Math.max(...cajas.map((c) => c.y_max), 0) + h / 2 + 20);
  let mejor = { x: 1000 - w / 2 - 40, y: 1000 - h / 2 - 30, coste: Infinity };
  for (let y = h / 2 + 30; y <= 1000 - h / 2 - 20; y += 15) {
    for (let x = w / 2 + 30; x <= 1000 - w / 2 - 30; x += 20) {
      let solape = 0;
      for (const c of cajas) {
        const ox = Math.min(x + w / 2, c.x_max + 10) - Math.max(x - w / 2, c.x_min - 10);
        const oy = Math.min(y + h / 2, c.y_max + 10) - Math.max(y - h / 2, c.y_min - 10);
        if (ox > 0 && oy > 0) solape += ox * oy;
      }
      const coste = solape + Math.abs(y - yObjetivo) * 3 + (1000 - x) * 0.5;
      if (coste < mejor.coste) mejor = { x, y, coste };
    }
  }
  return mejor;
}

export const Sello = ({ sello, lang, provisional }: { sello: NonNullable<DocEstado["sello"]>; lang: Idioma; provisional?: boolean }) => {
  const color = sello === "CONFORME" ? "var(--sello-azul)" : sello === "CON_RESERVAS" ? "var(--rojo)" : "var(--apagado)";
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={sello}
      initial={reduce ? { opacity: 0 } : { scale: 1.15, opacity: 0, rotate: -6 }}
      animate={{ scale: 1, opacity: provisional ? 0.5 : 0.92, rotate: -6 }}
      transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 520, damping: 22 }}
      className="pointer-events-none select-none whitespace-nowrap rounded-md border-[3px] px-[0.6em] py-[0.2em] font-serif text-[clamp(9px,3.4cqw,20px)] font-semibold leading-[1.3] tracking-[0.12em]"
      style={{ color, borderColor: color, boxShadow: `inset 0 0 0 1.5px ${color}`, mixBlendMode: "multiply", filter: "url(#tinta)" }}
      aria-label={SELLO[sello][lang]}
    >
      {SELLO[sello][lang]}
    </motion.div>
  );
};

export const Papel = forwardRef<HTMLElement, { doc: DocEstado; lang: Idioma; foco: Foco | null; onTocarLinea?: (docId: string, idx: number) => void }>(function Papel({ doc, lang, foco, onTocarLinea }, ref) {
  const reduce = useReducedMotion();
  const w = doc.width ?? 3, h = doc.height ?? 4;
  const lineas = doc.leido?.lineas ?? [];
  const cajasFoco = foco?.docId === doc.docId ? foco.cajas.map((c) => pad(c)) : [];
  const miradas = [...(doc.investigacion?.evidencias ?? []), ...(doc.expediente?.evidencias ?? [])].filter((e) => e.recorte);
  const sitio = doc.sello ? sitioSello(doc.leido, SELLO[doc.sello][lang], w / h) : null;
  const pines = doc.avisos
    .filter((a) => a.clase === "dinero" && a.centimos > 0 && a.lineaIdx != null)
    .map((a) => {
      const l = lineas[a.lineaIdx!];
      const c = l?.importe.caja ?? l?.caja_fila;
      return c ? { a, c } : null;
    })
    .filter(Boolean) as { a: (typeof doc.avisos)[number]; c: Caja }[];

  return (
    <figure ref={ref} className="relative w-full overflow-hidden rounded-[3px] [container-type:inline-size] bg-white shadow-[0_1px_0_rgba(27,23,18,0.06),0_12px_32px_-12px_rgba(27,23,18,0.35)]" style={{ aspectRatio: `${w} / ${h}` }}>
      {doc.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={doc.imagen} alt={lang === "es" ? `Albarán ${doc.proveedor ?? ""}` : `Delivery note ${doc.proveedor ?? ""}`} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 animate-[pulso_1.6s_ease-in-out_infinite] bg-papel-2" />
      )}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* Highlighter under each line read (lower part of the row, like a marker stroke). */}
        {lineas.map((l, i) =>
          l.caja_fila && l.caja_fila.y_max - l.caja_fila.y_min >= 4 ? (
            <motion.rect
              key={`r${i}`}
              x={l.caja_fila.x_min}
              y={l.caja_fila.y_min + (l.caja_fila.y_max - l.caja_fila.y_min) * 0.45}
              width={Math.max(4, l.caja_fila.x_max - l.caja_fila.x_min)}
              height={Math.max(4, (l.caja_fila.y_max - l.caja_fila.y_min) * 0.6)}
              rx={3}
              fill="var(--rotulador)"
              style={{ mixBlendMode: "multiply", transformBox: "fill-box", originX: 0, cursor: onTocarLinea ? "pointer" : undefined }}
              initial={reduce ? { opacity: 0 } : { scaleX: 0, opacity: 0.5 }}
              animate={{ scaleX: 1, opacity: 0.5 }}
              transition={reduce ? { duration: 0.1 } : { delay: 0.06 * i, duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => onTocarLinea?.(doc.docId, i)}
            />
          ) : null,
        )}
        {/* Focus: dim the rest of the paper and draw a strong stroke on the tapped boxes. */}
        <AnimatePresence>
          {cajasFoco.length > 0 && (
            <motion.g key="foco" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <defs>
                <mask id={`m-${doc.docId}`}>
                  <rect x="0" y="0" width="1000" height="1000" fill="white" />
                  {cajasFoco.map((c, i) => <rect key={i} x={c.x_min} y={c.y_min} width={c.x_max - c.x_min} height={c.y_max - c.y_min} rx="6" fill="black" />)}
                </mask>
              </defs>
              <rect x="0" y="0" width="1000" height="1000" fill="var(--papel)" opacity="0.65" mask={`url(#m-${doc.docId})`} />
              {cajasFoco.map((c, i) => (
                <motion.rect key={`f${i}`} x={c.x_min} y={c.y_min} width={c.x_max - c.x_min} height={c.y_max - c.y_min} rx="6" fill="var(--rotulador)"
                  style={{ mixBlendMode: "multiply", transformBox: "fill-box", originX: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.12 + i * 0.12, duration: 0.3 }} opacity={0.75} />
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
      {/* Where the agent looked: one dashed box per crop, with its evidence id. */}
      {doc.width && doc.height && miradas.map((e, i) => (
        <motion.div key={e.id} className="pointer-events-none absolute z-10 rounded-md border-2 border-dashed border-sello"
          style={{ left: `${(e.recorte!.x / doc.width!) * 100}%`, top: `${(e.recorte!.y / doc.height!) * 100}%`, width: `${(e.recorte!.w / doc.width!) * 100}%`, height: `${(e.recorte!.h / doc.height!) * 100}%` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04 }} animate={{ opacity: 0.9, scale: 1 }} transition={{ delay: 0.15 + i * 0.25 }}>
          <span className="absolute -top-5 left-0 rounded bg-sello px-1.5 text-[10px] font-semibold text-white">{e.id}</span>
        </motion.div>
      ))}
      {/* Money pins next to the problem. */}
      {pines.map(({ a, c }, i) => (
        <motion.span key={`${a.codigo}-${a.lineaIdx}`} className="cifras absolute z-10 -translate-y-1/2 whitespace-nowrap rounded-full bg-rojo px-2 py-0.5 text-[11px] font-semibold text-white shadow-md sm:text-xs"
          style={{ right: `${Math.max(1, 100 - c.x_min / 10 + 1)}%`, top: `${((c.y_min + c.y_max) / 2) / 10}%` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
          +{formatCents(a.centimos, lang)}
        </motion.span>
      ))}
      {doc.sello && sitio && (
        <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${sitio.x / 10}%`, top: `${sitio.y / 10}%` }}>
          <Sello sello={doc.sello} lang={lang} provisional={doc.provisional} />
        </div>
      )}
      {(doc.leyendo || doc.investigando || doc.reclamando) && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-white/95 to-white/0 px-3 pb-2 pt-6 text-xs text-tinta-2">
          <span className="h-2 w-2 animate-[pulso_1.2s_ease-in-out_infinite] rounded-full bg-sello" />
          {doc.investigando ? (lang === "es" ? "Investigando lo que no cuadra…" : "Investigating what doesn't add up…")
            : doc.reclamando ? (lang === "es" ? "Confirmando en el papel antes de reclamar…" : "Confirming on the paper before claiming…")
            : lang === "es" ? "Leyendo…" : "Reading…"}
        </div>
      )}
    </figure>
  );
});
