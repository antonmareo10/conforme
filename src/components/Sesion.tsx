"use client";
// The result screen. Fed only by pipeline events: a recorded replay (real timings) or a live run.
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { reducir, sesionVacia, type SesionEstado } from "@/lib/sesion/estado";
import type { Evento } from "@/lib/pipeline";
import type { Aviso } from "@/lib/checks/types";
import type { Caja } from "@/lib/albaran/schema";
import { T } from "@/lib/sesion/textos";
import { BotonIdioma, useIdioma } from "./Idioma";
import { Papel, type Foco } from "./Papel";
import { Escena } from "./Escena";
import { HERO_SRCSET } from "@/lib/hero";
import { OtrosAvisos, Panel } from "./Panel";
import { Reclamaciones } from "./Reclamaciones";
import { Cronologia } from "./Cronologia";
import { Preguntas, type PreguntaGrabada } from "./Preguntas";

type Accion = { tipo: "evento"; ev: Evento } | { tipo: "reiniciar" };
const reductor = (s: SesionEstado, a: Accion) => (a.tipo === "reiniciar" ? sesionVacia() : reducir(s, a.ev));

type Velocidad = 1 | 2 | 4;

export interface Replay {
  id: string;
  grabado: string;
  eventos: { t: number; ev: Evento }[];
}

/** Read the SSE stream of /api/escaneo and dispatch every event as it arrives. */
async function enVivo(fotos: Blob[], contexto: unknown, onEvento: (ev: Evento) => void, senal: AbortSignal): Promise<string | null> {
  const fd = new FormData();
  fotos.forEach((f, i) => fd.append("fotos", f, `foto${i + 1}.jpg`));
  fd.append("contexto", JSON.stringify(contexto));
  const res = await fetch("/api/escaneo", { method: "POST", body: fd, signal: senal });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    return (j as { error?: string }).error ?? `HTTP ${res.status}`;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const bloque = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
      if (linea) onEvento(JSON.parse(linea.slice(6)) as Evento);
    }
  }
  return null;
}

const MENSAJE_ERROR: Record<string, { es: string; en: string }> = {
  TOPE_DIARIO: { es: "Por hoy se acabaron las lecturas en vivo. Mira una muestra grabada.", en: "Live reads are done for today. Watch a recorded sample." },
  TOPE_IP: { es: "Has hecho muchas lecturas en la última hora. Prueba en un rato o mira una muestra grabada.", en: "Too many reads in the last hour. Try again later or watch a recorded sample." },
  SIN_DIRECTO: { es: "Las lecturas en vivo están en pausa. Mira una muestra grabada.", en: "Live reads are paused. Watch a recorded sample." },
};

/** Which model read a recorded sample: Muse Spark 1.3 on the Meta API, or Muse Spark Open (open weights) on Baseten. */
export type ModeloMuestra = "spark" | "abierto";

export function Sesion({ muestra, replay, modelo, foto, vivo, contexto, instantaneo }: { muestra?: string; replay?: string; modelo?: ModeloMuestra; foto: string | null; vivo?: Blob[]; contexto?: unknown; instantaneo?: boolean }) {
  const lang = useIdioma();
  // Recorded runs play at ×2 by default (labelled, real timings ÷ 2); ×1 shows the real pace.
  const [velocidad, setVelocidad] = useState<Velocidad>(2);
  const [sesion, dispatch] = useReducer(reductor, undefined, sesionVacia);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [grabado, setGrabado] = useState<string | null>(null);
  const [grabadas, setGrabadas] = useState<PreguntaGrabada[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cargado = useRef<Replay | null>(null);
  const papeles = useRef<Record<string, HTMLElement | null>>({});
  const t = T[lang];


  const reproducir = useCallback(async (vel: Velocidad) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dispatch({ tipo: "reiniciar" });
    setFoco(null);
    if (!muestra) return;
    try {
      const r = (await fetch(`/replays/${replay ?? muestra}.json`).then((x) => x.json())) as Replay & { preguntas?: PreguntaGrabada[] };
      cargado.current = r;
      setGrabado(r.grabado);
      setGrabadas(r.preguntas);
      if (instantaneo) { for (const { ev } of r.eventos) dispatch({ tipo: "evento", ev }); return; }
      for (const { t, ev } of r.eventos) timers.current.push(setTimeout(() => dispatch({ tipo: "evento", ev }), t / vel));
    } catch {
      setError(lang === "es" ? "No se pudo cargar la muestra." : "Could not load the sample.");
    }
  }, [muestra, replay, lang, instantaneo]);

  // Skip the wait: every recorded event at once, same reducer, same final state as the timed replay.
  const saltar = useCallback(() => {
    const r = cargado.current;
    if (!r) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dispatch({ tipo: "reiniciar" });
    for (const { ev } of r.eventos) dispatch({ tipo: "evento", ev });
  }, []);

  useEffect(() => {
    if (vivo) {
      const ctl = new AbortController();
      const id = setTimeout(() => {
        enVivo(vivo, contexto ?? {}, (ev) => dispatch({ tipo: "evento", ev }), ctl.signal)
          .then((e) => { if (e) setError(MENSAJE_ERROR[e]?.[lang] ?? e); })
          .catch((e) => { if ((e as Error).name !== "AbortError") setError(lang === "es" ? "Algo ha fallado al leer. Tus fotos siguen aquí: reintentar." : "Something went wrong while reading. Your photos are still here: try again."); });
      }, 0);
      return () => { clearTimeout(id); ctl.abort(); };
    }
    const arranque = setTimeout(() => reproducir(velocidad), 0);
    const ts = timers.current;
    return () => { clearTimeout(arranque); ts.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muestra, replay, vivo]);

  // "Tap any euro": light up the boxes behind an amount, one paper after another.
  const enfocarRefs = useCallback((refs: { docId: string; lineaIdx: number | null }[]) => {
    const porDoc = new Map<string, Caja[]>();
    for (const a of refs) {
      const leido = sesion.docs[a.docId]?.leido;
      const l = a.lineaIdx != null ? leido?.lineas[a.lineaIdx] : undefined;
      const c = a.lineaIdx != null ? l?.caja_fila ?? l?.importe.caja : leido?.total.caja;
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
  const enfocar = useCallback((avisos: Aviso[]) => enfocarRefs(avisos.map((a) => ({ docId: a.docId, lineaIdx: a.lineaIdx ?? null }))), [enfocarRefs]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFoco(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const docs = sesion.orden.map((id) => sesion.docs[id]);
  // The month sample is about asking; the counter sample and live runs are about claiming.
  const preguntasPrimero = muestra === "mes";
  // Questions are live on the samples too (voice or text, rate-limited per IP); the example chips use recorded intents.
  const preguntas = (grabadas?.length || vivo) ? <Preguntas sesion={sesion} lang={lang} onFoco={enfocarRefs} grabadas={grabadas} directo /> : null;
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 sm:px-6">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="tinta"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" /><feComposite in="SourceGraphic" operator="in" /></filter>
      </svg>
      {/* Phones: logo and language on the first row, replay controls on the second. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
        <Link href="/" className="order-1 font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
        <div className="order-3 flex basis-full flex-wrap items-center gap-2 sm:order-2 sm:ml-auto sm:basis-auto sm:justify-end">
          {muestra ? (
            <>
              <span className="hidden rounded-full border border-linea bg-white/70 px-3 py-1 text-xs text-tinta-2 sm:inline">
                {t.muestraGrabada}{muestra === "encimera" ? t.fondoMuseImage : ""}{grabado ? ` · ${new Date(grabado).toLocaleDateString(lang === "es" ? "es-ES" : "en-GB")}` : ""}
              </span>
              {!instantaneo && (
                <div role="group" aria-label={lang === "es" ? "Velocidad de la repetición" : "Replay speed"} className="flex rounded-full border border-linea bg-white p-0.5">
                  {([1, 2, 4] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={velocidad === v} onClick={() => { setVelocidad(v); reproducir(v); }}
                      className={`cifras min-h-[36px] min-w-[40px] rounded-full px-2 text-sm transition ${velocidad === v ? "bg-tinta text-papel" : "text-tinta-2 hover:text-tinta"}`}>
                      ×{v}
                    </button>
                  ))}
                </div>
              )}
              {!instantaneo && !sesion.fin && (
                <button type="button" onClick={saltar} className="min-h-[40px] rounded-full bg-tinta px-3 text-sm font-medium text-papel">{lang === "es" ? "Ver el resultado" : "Skip to result"}</button>
              )}
              <button type="button" onClick={() => reproducir(velocidad)} className="min-h-[40px] rounded-full border border-linea bg-white px-3 text-sm">{t.repetir}</button>
            </>
          ) : (
            <span className="rounded-full bg-verde/10 px-3 py-1 text-xs font-medium text-verde">{lang === "es" ? "En vivo" : "Live"}</span>
          )}
        </div>
        <BotonIdioma className="order-2 ml-auto sm:order-3 sm:ml-0" />
      </header>
      {muestra && <p className="mb-4 text-xs text-apagado sm:hidden">{t.muestraGrabada}{muestra === "encimera" ? t.fondoMuseImage : ""}</p>}
      {modelo && <SelectorModelo modelo={modelo} lang={lang} />}
      {muestra && !instantaneo && velocidad !== 1 && <p className="mb-2 text-xs text-apagado">{lang === "es" ? `Reproduciendo a ×${velocidad} (tiempos reales ÷ ${velocidad})` : `Playing at ×${velocidad} (real timings ÷ ${velocidad})`}</p>}
      {error && <p className="rounded-lg bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          {foto && <Escena foto={foto} srcSet={foto.includes("/encimera/") ? HERO_SRCSET : undefined} sizes="(min-width: 1024px) 800px, calc(100vw - 32px)" sesion={sesion} lang={lang} prioridad />}
          <div className="grid gap-6 sm:grid-cols-2">
            {docs.map((d) => (
              <Papel key={d.docId} ref={(el) => { papeles.current[d.docId] = el; }} doc={d} lang={lang} foco={foco}
                onTocarLinea={(docId, idx) => { const a = d.avisos.find((x) => x.lineaIdx === idx); if (a) enfocar([a]); else { const c = d.leido?.lineas[idx]?.caja_fila; if (c) setFoco({ docId, cajas: [c] }); } }} />
            ))}
          </div>
        </div>
        <aside className="order-first flex flex-col gap-6 lg:order-none lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pb-4 lg:pr-1">
          <Panel sesion={sesion} lang={lang} onFoco={enfocar} />
          {preguntasPrimero && preguntas}
          <Reclamaciones sesion={sesion} lang={lang} onFoco={enfocar} />
          {!preguntasPrimero && preguntas}
          <OtrosAvisos sesion={sesion} lang={lang} onFoco={enfocar} />
          <div className="rounded-2xl border border-linea bg-white/60 p-5">
            <Cronologia sesion={sesion} lang={lang} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** The counter sample was recorded twice, with the same pipeline and code: read by Muse Spark 1.3, and by Muse Spark Open. */
function SelectorModelo({ modelo, lang }: { modelo: ModeloMuestra; lang: "es" | "en" }) {
  const op = (m: ModeloMuestra, href: string, nombre: string, donde: string) => (
    <Link href={href} replace scroll={false} prefetch={false} aria-current={modelo === m ? "true" : undefined}
      className={`flex min-h-[40px] flex-col justify-center rounded-full px-3 text-left leading-tight transition ${modelo === m ? "bg-tinta text-papel" : "text-tinta-2 hover:text-tinta"}`}>
      <span className="text-sm font-medium">{nombre}</span>
      <span className={`text-[11px] ${modelo === m ? "text-papel/75" : "text-apagado"}`}>{donde}</span>
    </Link>
  );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-apagado">{lang === "es" ? "Lee" : "Read by"}</span>
      <nav aria-label={lang === "es" ? "Modelo que lee la muestra" : "Model that reads the sample"} className="flex flex-wrap rounded-3xl border border-linea bg-white p-0.5">
        {op("spark", "/sesion?muestra=encimera", "Muse Spark 1.3", "Meta Model API")}
        {op("abierto", "/sesion?muestra=encimera&modelo=abierto", "Muse Spark Open", lang === "es" ? "pesos abiertos · Baseten" : "open weights · Baseten")}
      </nav>
      {modelo === "abierto" && (
        <p className="basis-full text-xs text-tinta-2 sm:basis-auto">
          {lang === "es" ? "Mismo flujo y mismas comprobaciones del código; solo cambia el modelo que lee y razona. " : "Same pipeline and the same code checks; only the model that reads and reasons changes. "}
          <Link href="/como#abierto" className="underline decoration-rotulador decoration-2 underline-offset-2">{lang === "es" ? "Cómo se compara" : "How it compares"}</Link>
        </p>
      )}
    </div>
  );
}
