"use client";
// What really happened, step by step: SAM, reading, checks, and what each agent did (the full trace,
// with every crop, is in the claim it prepared). Timings are the real ones.
import type { DocEstado, SesionEstado } from "@/lib/sesion/estado";
import { T, type Idioma } from "@/lib/sesion/textos";

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
  const es = lang === "es";
  const inv = d.investigacion;
  const exp = d.expediente;
  const confirmadas = exp?.puntos.filter((p) => p.estado === "confirmada").length ?? 0;
  const retenidas = exp?.puntos.filter((p) => p.estado === "retenida").length ?? 0;
  const herramientas = (pasos: { herramienta: string }[]) => pasos.filter((p) => !p.herramienta.startsWith("cerrar")).length;
  return (
    <>
      <Paso ok={!!d.leido} activo={d.leyendo}>
        {n}. {d.proveedor ?? (es ? "Albarán" : "Note")} · {t.etapas.leer.toLowerCase()} {d.leidoMs != null && <>· {d.leido?.lineas.length} {es ? "líneas" : "lines"} · {s(d.leidoMs)}</>}
      </Paso>
      {(d.investigando || inv) && (
        <Paso ok={!!inv} activo={d.investigando}>
          <span className="text-tinta">{t.etapas.investigar}</span>
          {inv && (
            <> · {herramientas(inv.pasos)} {es ? "herramientas" : "tools"} · {inv.veredicto ? <b className="font-medium text-tinta">{VEREDICTO[inv.veredicto]?.[lang] ?? inv.veredicto}</b> : null}
              {" "}<span className={`rounded px-1.5 py-0.5 text-[11px] ${inv.valido ? "bg-verde/10 text-verde" : "bg-rojo/10 text-rojo"}`}>{inv.valido ? (es ? "validado por el código" : "validated by code") : es ? "rechazado por el código" : "rejected by code"}</span>
              <span className="cifras ml-1 text-xs text-apagado">{s(inv.ms)}</span></>
          )}
        </Paso>
      )}
      {(d.reclamando || exp) && (
        <Paso ok={!!exp} activo={d.reclamando}>
          <span className="text-tinta">{es ? "Confirmando la reclamación en el papel" : "Confirming the claim on the paper"}</span>
          {exp && (
            <> · {herramientas(exp.pasos)} {es ? "herramientas" : "tools"} · <b className="font-medium text-tinta">{confirmadas} {es ? "confirmada" : "confirmed"}{confirmadas === 1 || !es ? "" : "s"}{retenidas ? `, ${retenidas} ${es ? "retenida" : "held back"}${retenidas === 1 || !es ? "" : "s"}` : ""}</b>
              <span className="cifras ml-1 text-xs text-apagado">{s(exp.ms)}</span></>
          )}
        </Paso>
      )}
    </>
  );
}
