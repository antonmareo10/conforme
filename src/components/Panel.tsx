"use client";
// Right-hand panel: € at stake counting up to the real value, its breakdown, and every warning
// ordered by money. Every amount is a button that lights up its place on the paper.
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import type { Aviso } from "@/lib/checks/types";
import type { DocEstado, SesionEstado } from "@/lib/sesion/estado";
import { T, textoAviso, type Idioma } from "@/lib/sesion/textos";
import { formatCents } from "@/lib/numbers";
import { reclamacion } from "@/lib/reclamacion";

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

export function Panel({ sesion, lang, onFoco }: { sesion: SesionEstado; lang: Idioma; onFoco: (avisos: Aviso[]) => void }) {
  const t = T[lang];
  const [copiado, setCopiado] = useState<string | null>(null);
  const docs = sesion.orden.map((id) => sesion.docs[id]);
  const finales = docs.filter((d) => !d.provisional);
  const avisos = finales.flatMap((d) => d.avisos.map((a) => ({ a, d }))).filter(({ a }) => a.codigo !== "NIF" && !(a.codigo === "ILEGIBLE" && a.clase === "info"));
  const dinero = avisos.filter(({ a }) => a.clase === "dinero" && a.centimos > 0).sort((x, y) => y.a.centimos - x.a.centimos);
  const resto = avisos.filter(({ a }) => !(a.clase === "dinero" && a.centimos > 0));
  const total = dinero.reduce((s, x) => s + x.a.centimos, 0);
  const desglose: [string, Aviso["codigo"]][] = [[t.subidas, "SUBIDA"], [t.faltas, "FALTA"], [t.erroresProveedor, "ERROR_PROVEEDOR"], [t.duplicados, "DUPLICADO"]];

  const copiar = async (d: DocEstado) => {
    const txt = reclamacion(d.avisos, { numero: d.numero, fecha: d.fecha, proveedor: d.proveedor }, d.leido, lang);
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt); setCopiado(d.docId); setTimeout(() => setCopiado(null), 2200); } catch { /* clipboard blocked: nothing to do */ }
  };
  const producto = (a: Aviso, d: DocEstado) => (a.lineaIdx != null ? d.leido?.lineas[a.lineaIdx]?.descripcion.texto ?? null : null);

  return (
    <section aria-labelledby="enjuego" className="flex flex-col gap-5">
      <div className="rounded-2xl border border-linea bg-white/70 p-5 backdrop-blur">
        <h2 id="enjuego" className="text-sm font-medium uppercase tracking-[0.12em] text-apagado">{t.enJuego}</h2>
        <button type="button" onClick={() => onFoco(dinero.map((x) => x.a))} className="mt-1 block text-left font-serif text-5xl font-semibold text-rojo sm:text-6xl" aria-label={`${t.enJuego}: ${formatCents(total, lang)}`}>
          <Cifra cents={total} lang={lang} />
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {desglose.map(([label, cod]) => {
            const items = dinero.filter((x) => x.a.codigo === cod);
            if (!items.length) return null;
            return (
              <button key={cod} type="button" onClick={() => onFoco(items.map((x) => x.a))}
                className="cifras min-h-[36px] rounded-full border border-linea bg-papel px-3 text-sm text-tinta-2 transition hover:border-rojo hover:text-rojo">
                {label} · {formatCents(items.reduce((s, x) => s + x.a.centimos, 0), lang)}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {[...dinero, ...resto].map(({ a, d }, i) => (
          <motion.li key={`${d.docId}-${a.codigo}-${a.lineaIdx}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-linea bg-white p-4">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.clase === "dinero" ? "bg-rojo" : a.clase === "lectura" ? "bg-apagado" : "bg-sello"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug text-tinta">{textoAviso(a, lang, producto(a, d))}</p>
                <p className="mt-1 text-xs text-apagado">{d.proveedor ?? d.docId}{d.numero ? ` · nº ${d.numero}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.lineaIdx != null && (
                    <button type="button" onClick={() => onFoco([a])} className="min-h-[36px] rounded-lg bg-tinta px-3 text-sm font-medium text-papel transition active:scale-[0.97]">
                      {t.verEnPapel}
                    </button>
                  )}
                  {a.clase === "dinero" && a.centimos > 0 && (
                    <button type="button" onClick={() => copiar(d)} className="min-h-[36px] rounded-lg border border-tinta/20 px-3 text-sm font-medium text-tinta transition hover:border-tinta active:scale-[0.97]">
                      {copiado === d.docId ? t.copiada : t.copiarReclamacion}
                    </button>
                  )}
                </div>
              </div>
              {a.centimos > 0 && (
                <button type="button" onClick={() => onFoco([a])} className="cifras shrink-0 rounded-md px-1 text-right text-lg font-semibold text-rojo underline decoration-rotulador decoration-4 underline-offset-4">
                  {formatCents(a.centimos, lang)}
                </button>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
