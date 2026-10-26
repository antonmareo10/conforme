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

export const Sello = ({ sello, lang, provisional }: { sello: NonNullable<DocEstado["sello"]>; lang: Idioma; provisional?: boolean }) => {
  const color = sello === "CONFORME" ? "var(--sello-azul)" : sello === "CON_RESERVAS" ? "var(--rojo)" : "var(--apagado)";
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={sello}
      initial={reduce ? { opacity: 0 } : { scale: 1.15, opacity: 0, rotate: -6 }}
      animate={{ scale: 1, opacity: provisional ? 0.5 : 0.92, rotate: -6 }}
      transition={reduce ? { duration: 0.1 } : { type: "spring", stiffness: 520, damping: 22 }}
      className="pointer-events-none select-none rounded-md border-[3px] px-3 py-1 font-serif text-[clamp(0.8rem,2.2vw,1.15rem)] font-semibold tracking-[0.12em]"
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
  const pines = doc.avisos
    .filter((a) => a.clase === "dinero" && a.centimos > 0 && a.lineaIdx != null)
    .map((a) => {
      const l = lineas[a.lineaIdx!];
      const c = l?.importe.caja ?? l?.caja_fila;
      return c ? { a, c } : null;
    })
    .filter(Boolean) as { a: (typeof doc.avisos)[number]; c: Caja }[];

  return (
    <figure ref={ref} className="relative w-full overflow-hidden rounded-[3px] bg-white shadow-[0_1px_0_rgba(27,23,18,0.06),0_12px_32px_-12px_rgba(27,23,18,0.35)]" style={{ aspectRatio: `${w} / ${h}` }}>
      {doc.imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={doc.imagen} alt={lang === "es" ? `Albarán ${doc.proveedor ?? ""}` : `Delivery note ${doc.proveedor ?? ""}`} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 animate-[pulso_1.6s_ease-in-out_infinite] bg-papel-2" />
      )}
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* Highlighter under each line read (lower part of the row, like a marker stroke). */}
        {lineas.map((l, i) =>
          l.caja_fila ? (
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
      {/* Money pins next to the problem. */}
      {pines.map(({ a, c }, i) => (
        <motion.span key={`${a.codigo}-${a.lineaIdx}`} className="cifras absolute z-10 -translate-y-1/2 whitespace-nowrap rounded-full bg-rojo px-2 py-0.5 text-[11px] font-semibold text-white shadow-md sm:text-xs"
          style={{ right: `${Math.max(1, 100 - c.x_min / 10 + 1)}%`, top: `${((c.y_min + c.y_max) / 2) / 10}%` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }}>
          +{formatCents(a.centimos, lang)}
        </motion.span>
      ))}
      {doc.sello && (
        <div className="absolute bottom-[6%] right-[5%] z-10">
          <Sello sello={doc.sello} lang={lang} provisional={doc.provisional} />
        </div>
      )}
      {(doc.leyendo || doc.investigando) && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-white/95 to-white/0 px-3 pb-2 pt-6 text-xs text-tinta-2">
          <span className="h-2 w-2 animate-[pulso_1.2s_ease-in-out_infinite] rounded-full bg-sello" />
          {doc.investigando ? (lang === "es" ? "Investigando lo que no cuadra…" : "Investigating what doesn't add up…") : lang === "es" ? "Leyendo…" : "Reading…"}
        </div>
      )}
    </figure>
  );
});
