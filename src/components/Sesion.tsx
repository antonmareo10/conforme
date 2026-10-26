"use client";
// The result screen. Fed only by pipeline events: a recorded replay (real timings) or a live run.
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { reducir, sesionVacia, type SesionEstado } from "@/lib/sesion/estado";
import type { Evento } from "@/lib/pipeline";
import type { Aviso } from "@/lib/checks/types";
import type { Caja } from "@/lib/albaran/schema";
import { T, type Idioma } from "@/lib/sesion/textos";
import { Papel, type Foco } from "./Papel";
import { Escena } from "./Escena";
import { Panel } from "./Panel";
import { Cronologia } from "./Cronologia";

type Accion = { tipo: "evento"; ev: Evento } | { tipo: "reiniciar" };
const reductor = (s: SesionEstado, a: Accion) => (a.tipo === "reiniciar" ? sesionVacia() : reducir(s, a.ev));

export interface Replay {
  id: string;
  grabado: string;
  eventos: { t: number; ev: Evento }[];
}

export function Sesion({ muestra, foto }: { muestra: string; foto: string }) {
  const [lang, setLang] = useState<Idioma>("es");
  const [velocidad, setVelocidad] = useState<1 | 4>(1);
  const [sesion, dispatch] = useReducer(reductor, undefined, sesionVacia);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [grabado, setGrabado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const papeles = useRef<Record<string, HTMLElement | null>>({});
  const t = T[lang];

  useEffect(() => {
    const id = setTimeout(() => {
      try { const l = localStorage.getItem("conforme.lang"); if (l === "en" || l === "es") setLang(l); } catch { /* storage blocked */ }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const cambiarIdioma = () => {
    const l = lang === "es" ? "en" : "es";
    setLang(l);
    try { localStorage.setItem("conforme.lang", l); } catch { /* storage blocked */ }
    document.documentElement.lang = l;
  };

  const reproducir = useCallback(async (vel: 1 | 4) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dispatch({ tipo: "reiniciar" });
    setFoco(null);
    try {
      const r = (await fetch(`/replays/${muestra}.json`).then((x) => x.json())) as Replay;
      setGrabado(r.grabado);
      for (const { t, ev } of r.eventos) timers.current.push(setTimeout(() => dispatch({ tipo: "evento", ev }), t / vel));
    } catch {
      setError(lang === "es" ? "No se pudo cargar la muestra." : "Could not load the sample.");
    }
  }, [muestra, lang]);

  useEffect(() => {
    const arranque = setTimeout(() => reproducir(velocidad), 0);
    const ts = timers.current;
    return () => { clearTimeout(arranque); ts.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muestra]);

  // "Tap any euro": light up the boxes behind an amount, one paper after another.
  const enfocar = useCallback((avisos: Aviso[]) => {
    const porDoc = new Map<string, Caja[]>();
    for (const a of avisos) {
      const l = a.lineaIdx != null ? sesion.docs[a.docId]?.leido?.lineas[a.lineaIdx] : undefined;
      const c = l?.caja_fila ?? l?.importe.caja;
      if (c) porDoc.set(a.docId, [...(porDoc.get(a.docId) ?? []), c]);
    }
    const docs = [...porDoc.entries()];
    docs.forEach(([docId, cajas], i) => {
      timers.current.push(setTimeout(() => {
        setFoco({ docId, cajas });
        papeles.current[docId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, i * 1400));
    });
  }, [sesion.docs]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFoco(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const docs = sesion.orden.map((id) => sesion.docs[id]);
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 sm:px-6">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="tinta"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" /><feComposite in="SourceGraphic" operator="in" /></filter>
      </svg>
      <header className="flex items-center justify-between gap-3 py-2">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-linea bg-white/70 px-3 py-1 text-xs text-tinta-2 sm:inline">
            {t.muestraGrabada}{grabado ? ` · ${new Date(grabado).toLocaleDateString(lang === "es" ? "es-ES" : "en-GB")}` : ""}
          </span>
          <button type="button" onClick={() => { const v = velocidad === 1 ? 4 : 1; setVelocidad(v); reproducir(v); }} className="min-h-[40px] rounded-full border border-linea bg-white px-3 text-sm">
            {velocidad === 1 ? "×4" : "×1"}
          </button>
          <button type="button" onClick={() => reproducir(velocidad)} className="min-h-[40px] rounded-full border border-linea bg-white px-3 text-sm">{t.repetir}</button>
          <button type="button" onClick={cambiarIdioma} className="min-h-[40px] min-w-[44px] rounded-full bg-tinta px-3 text-sm font-semibold text-papel" aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}>
            {lang === "es" ? "EN" : "ES"}
          </button>
        </div>
      </header>
      <p className="mb-4 text-xs text-apagado sm:hidden">{t.muestraGrabada}</p>
      {velocidad === 4 && <p className="mb-2 text-xs text-apagado">{lang === "es" ? "Reproduciendo a ×4 (tiempos reales ÷ 4)" : "Playing at ×4 (real timings ÷ 4)"}</p>}
      {error && <p className="rounded-lg bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Escena foto={foto} sesion={sesion} lang={lang} />
          <div className="grid gap-6 sm:grid-cols-2">
            {docs.map((d) => (
              <Papel key={d.docId} ref={(el) => { papeles.current[d.docId] = el; }} doc={d} lang={lang} foco={foco}
                onTocarLinea={(docId, idx) => { const a = d.avisos.find((x) => x.lineaIdx === idx); if (a) enfocar([a]); else { const c = d.leido?.lineas[idx]?.caja_fila; if (c) setFoco({ docId, cajas: [c] }); } }} />
            ))}
          </div>
        </div>
        <aside className="order-first flex flex-col gap-6 lg:order-none lg:sticky lg:top-4 lg:self-start">
          <Panel sesion={sesion} lang={lang} onFoco={enfocar} />
          <div className="rounded-2xl border border-linea bg-white/60 p-5">
            <Cronologia sesion={sesion} lang={lang} />
          </div>
        </aside>
      </div>
    </div>
  );
}
