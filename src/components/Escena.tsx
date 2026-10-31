"use client";
// The original photo with SAM's outline of every note drawn as it arrives. While a note is being read, or
// the agent is re-reading it, a highlighter band sweeps across that paper only (an activity cue, not progress).
import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { SesionEstado } from "@/lib/sesion/estado";
import type { Idioma } from "@/lib/sesion/textos";

export function Escena({ foto, srcSet, sizes, sesion, lang, fotoIdx = 0, prioridad = false }: { foto: string; srcSet?: string; sizes?: string; sesion: SesionEstado; lang: Idioma; fotoIdx?: number; prioridad?: boolean }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const meta = sesion.fotos[fotoIdx];
  const docs = sesion.orden.map((id) => sesion.docs[id]).filter((d) => d.foto === fotoIdx && d.contornoSVG);
  return (
    <figure className="relative overflow-hidden rounded-xl bg-tinta/5 shadow-inner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={foto} srcSet={srcSet} sizes={sizes} alt={lang === "es" ? "Foto de los albaranes" : "Photo of the delivery notes"} className="block h-auto w-full" width={1200} height={800} fetchPriority={prioridad ? "high" : "auto"} decoding="async" />
      {meta && (
        <svg viewBox={`0 0 ${meta.width} ${meta.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {docs.map((d, i) => (
            <motion.g key={d.docId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}>
              <motion.g
                fill="var(--rotulador)"
                fillOpacity={0}
                stroke="var(--sello-azul)"
                strokeWidth={Math.max(3, meta.width / 400)}
                strokeLinejoin="round"
                initial={reduce ? false : { fillOpacity: 0.28 }}
                animate={{ fillOpacity: 0.06 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                dangerouslySetInnerHTML={{ __html: d.contornoSVG! }}
              />
              {d.caja && !reduce && (d.leyendo || d.investigando || d.reclamando) && (
                <g>
                  <clipPath id={`barrido-${uid}-${d.docId}`} dangerouslySetInnerHTML={{ __html: d.contornoSVG! }} />
                  <rect x={d.caja.x} y={d.caja.y - d.caja.h * 0.14} width={d.caja.w} height={d.caja.h * 0.14} fill="var(--rotulador)" fillOpacity={0.42} clipPath={`url(#barrido-${uid}-${d.docId})`}>
                    <animate attributeName="y" from={d.caja.y - d.caja.h * 0.14} to={d.caja.y + d.caja.h} dur={d.leyendo ? "1.8s" : "1.1s"} begin={`${(i * 0.35).toFixed(2)}s`} repeatCount="indefinite" />
                  </rect>
                </g>
              )}
              {d.caja && (
                <text x={d.caja.x + 18} y={d.caja.y + 52} fontSize={Math.max(28, meta.width / 55)} fontWeight={600} fill="var(--sello-azul)" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 6 }}>
                  {i + 1}
                </text>
              )}
            </motion.g>
          ))}
        </svg>
      )}
    </figure>
  );
}
