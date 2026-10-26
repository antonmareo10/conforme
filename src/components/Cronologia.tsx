"use client";
// What really happened, step by step: SAM, reading, checks, and every tool call of the investigator
// with the crop it looked at. Timings are the real ones.
import { motion } from "motion/react";
import type { DocEstado, SesionEstado } from "@/lib/sesion/estado";
import { T, type Idioma } from "@/lib/sesion/textos";

const HERRAMIENTA: Record<string, Record<Idioma, string>> = {
  releer_celda: { es: "Releyó una celda ampliada", en: "Re-read one zoomed cell" },
  releer_fila: { es: "Releyó la fila ampliada", en: "Re-read the zoomed row" },
  releer_total: { es: "Releyó el total", en: "Re-read the total" },
  historial_precio: { es: "Miró el historial de precios", en: "Checked the price history" },
  pedido: { es: "Miró el pedido", en: "Checked the order" },
  recontar_filas: { es: "Recontó las filas", en: "Recounted the rows" },
  cerrar: { es: "Cerró la investigación", en: "Closed the investigation" },
};
const VEREDICTO: Record<string, Record<Idioma, string>> = {
  error_proveedor: { es: "Error del proveedor, confirmado en el papel", en: "Supplier error, confirmed on the paper" },
  celda_mal_leida: { es: "Celda mal leída, reparada", en: "Misread cell, repaired" },
  lectura_confirmada: { es: "Lectura confirmada", en: "Reading confirmed" },
  revisar: { es: "Mejor que lo mire una persona", en: "Better for a person to look" },
};
const s = (ms?: number) => (ms != null ? `${(ms / 1000).toFixed(1)} s` : "");

function Paso({ ok, activo, children }: { ok: boolean; activo?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${ok ? "border-verde bg-verde" : "border-sello"} ${activo ? "animate-[pulso_1.2s_ease-in-out_infinite]" : ""}`} aria-hidden>
        {ok && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white"><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <div className="min-w-0 flex-1 text-sm text-tinta-2">{children}</div>
    </li>
  );
}

export function Cronologia({ sesion, lang }: { sesion: SesionEstado; lang: Idioma }) {
  const t = T[lang];
  const buscar = sesion.etapas.buscar;
  const docs = sesion.orden.map((id) => sesion.docs[id]);
  return (
    <ol className="flex flex-col gap-3" aria-label={lang === "es" ? "Pasos del análisis" : "Analysis steps"}>
      {buscar && (
        <Paso ok={buscar.estado === "fin"} activo={buscar.estado === "inicio"}>
          {t.etapas.buscar}{buscar.estado === "fin" && <> · <b className="text-tinta">{buscar.detalle}</b> {lang === "es" ? "albaranes" : "notes"} · {s(buscar.ms)}</>}
        </Paso>
      )}
      {docs.map((d, i) => <DocPasos key={d.docId} d={d} n={i + 1} lang={lang} />)}
      {sesion.fin && (
        <li className="cifras pl-7 text-xs text-apagado">
          {lang === "es" ? "Total" : "Total"} {s(sesion.fin.ms)} · {t.coste} {sesion.fin.costeUsd.toFixed(3)} $
        </li>
      )}
    </ol>
  );
}

function DocPasos({ d, n, lang }: { d: DocEstado; n: number; lang: Idioma }) {
  const t = T[lang];
  const inv = d.investigacion;
  return (
    <>
      <Paso ok={!!d.leido} activo={d.leyendo}>
        {n}. {d.proveedor ?? (lang === "es" ? "Albarán" : "Note")} · {t.etapas.leer.toLowerCase()} {d.leidoMs != null && <>· {d.leido?.lineas.length} {lang === "es" ? "líneas" : "lines"} · {s(d.leidoMs)}</>}
      </Paso>
      {(d.investigando || inv) && (
        <Paso ok={!!inv} activo={d.investigando}>
          <span className="font-medium text-tinta">{t.investigacion}</span>
          {inv && (
            <ol className="mt-2 flex flex-col gap-2 border-l-2 border-linea pl-3">
              {inv.pasos.map((p) => {
                const ev = inv.evidencias.find((e) => e.id === p.evidenciaId);
                return (
                  <motion.li key={p.n} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: p.n * 0.08 }} className="flex items-center gap-3">
                    {ev?.miniatura && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.miniatura} alt="" className="h-10 w-24 shrink-0 rounded border border-linea object-cover object-left" />
                    )}
                    <span>
                      {HERRAMIENTA[p.herramienta]?.[lang] ?? p.herramienta}
                      {p.args.linea != null && <> · {lang === "es" ? "línea" : "line"} {String(p.args.linea)}</>}
                      {ev?.texto != null && <> → <b className="cifras text-tinta">{ev.texto}</b></>}
                      {p.evidenciaId && <span className="ml-1 rounded bg-papel-2 px-1 text-[10px] text-apagado">{p.evidenciaId}</span>}
                    </span>
                  </motion.li>
                );
              })}
              {inv.veredicto && (
                <li className="pt-1 text-tinta">
                  <b>{VEREDICTO[inv.veredicto]?.[lang] ?? inv.veredicto}</b>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${inv.valido ? "bg-verde/10 text-verde" : "bg-rojo/10 text-rojo"}`}>
                    {inv.valido ? (lang === "es" ? "validado por el código" : "validated by code") : (lang === "es" ? "rechazado por el código" : "rejected by code")}
                  </span>
                  <span className="cifras ml-2 text-xs text-apagado">{s(inv.ms)}</span>
                </li>
              )}
            </ol>
          )}
        </Paso>
      )}
    </>
  );
}
