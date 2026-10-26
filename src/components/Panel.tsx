"use client";
// Right-hand panel: € at stake counting up to the real value and its breakdown, and the warnings
// that carry no money. Every amount is a button that lights up its place on the paper.
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Aviso } from "@/lib/checks/types";
import type { DocEstado, SesionEstado } from "@/lib/sesion/estado";
import { T, textoAviso, type Idioma } from "@/lib/sesion/textos";
import { formatCents } from "@/lib/numbers";

export function Cifra({ cents, lang }: { cents: number; lang: Idioma }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const txt = useTransform(mv, (v) => formatCents(Math.round(v), lang));
  useEffect(() => {
    if (reduce) { mv.set(cents); return; }
    const c = animate(mv, cents, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [cents, mv, reduce]);
  return <motion.span className="cifras">{txt}</motion.span>;
}

/** € at stake: counts up to the real value (finished notes only), with its breakdown. */
export function Panel({ sesion, lang, onFoco }: { sesion: SesionEstado; lang: Idioma; onFoco: (avisos: Aviso[]) => void }) {
  const t = T[lang];
  const finales = sesion.orden.map((id) => sesion.docs[id]).filter((d) => !d.provisional);
  const dinero = finales.flatMap((d) => d.avisos).filter((a) => a.clase === "dinero" && a.centimos > 0).sort((x, y) => y.centimos - x.centimos);
  const total = dinero.reduce((s, a) => s + a.centimos, 0);
  const desglose: [string, Aviso["codigo"]][] = [[t.subidas, "SUBIDA"], [t.faltas, "FALTA"], [t.erroresProveedor, "ERROR_PROVEEDOR"], [t.duplicados, "DUPLICADO"]];
  return (
    <section aria-labelledby="enjuego" className="rounded-2xl border border-linea bg-white/70 p-5 backdrop-blur">
      <h2 id="enjuego" className="text-sm font-medium uppercase tracking-[0.12em] text-apagado">{t.enJuego}</h2>
      <button type="button" onClick={() => onFoco(dinero)} className="mt-1 block text-left font-serif text-5xl font-semibold text-rojo sm:text-6xl" aria-label={`${t.enJuego}: ${formatCents(total, lang)}`}>
        <Cifra cents={total} lang={lang} />
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {desglose.map(([label, cod]) => {
          const items = dinero.filter((a) => a.codigo === cod);
          if (!items.length) return null;
          return (
            <button key={cod} type="button" onClick={() => onFoco(items)}
              className="cifras min-h-[36px] rounded-full border border-linea bg-papel px-3 text-sm text-tinta-2 transition hover:border-rojo hover:text-rojo">
              {label} · {formatCents(items.reduce((s, a) => s + a.centimos, 0), lang)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Warnings with no money attached (doubts about a reading, repaired cells): short, each with its place on the paper. */
export function OtrosAvisos({ sesion, lang, onFoco }: { sesion: SesionEstado; lang: Idioma; onFoco: (avisos: Aviso[]) => void }) {
  const t = T[lang];
  const avisos = sesion.orden.map((id) => sesion.docs[id]).filter((d) => !d.provisional)
    .flatMap((d) => d.avisos.map((a) => ({ a, d })))
    .filter(({ a }) => !(a.clase === "dinero" && a.centimos > 0) && a.codigo !== "NIF" && !(a.codigo === "ILEGIBLE" && a.clase === "info"));
  if (!avisos.length) return null;
  const producto = (a: Aviso, d: DocEstado) => (a.lineaIdx != null ? d.leido?.lineas[a.lineaIdx]?.descripcion.texto ?? null : null);
  return (
    <section aria-label={lang === "es" ? "Otros avisos" : "Other warnings"}>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-[0.12em] text-apagado">{lang === "es" ? "Otros avisos" : "Other warnings"}</h2>
      <ul className="flex flex-col gap-2">
        {avisos.map(({ a, d }, i) => (
          <motion.li key={`${d.docId}-${a.codigo}-${a.lineaIdx}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="flex items-start gap-3 rounded-xl border border-linea bg-white p-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.clase === "lectura" ? "bg-apagado" : "bg-sello"}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-tinta">{textoAviso(a, lang, producto(a, d))}</p>
              <p className="mt-0.5 text-xs text-apagado">{d.proveedor ?? d.docId}{d.numero ? ` · nº ${d.numero}` : ""}</p>
            </div>
            {a.lineaIdx != null && (
              <button type="button" onClick={() => onFoco([a])} className="min-h-[36px] shrink-0 rounded-lg border border-tinta/20 px-2.5 text-xs font-medium text-tinta transition hover:border-tinta">
                {t.verEnPapel}
              </button>
            )}
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
