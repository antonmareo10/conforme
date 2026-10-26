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

export function Sesion({ muestra, foto, vivo, contexto, instantaneo }: { muestra?: string; foto: string | null; vivo?: Blob[]; contexto?: unknown; instantaneo?: boolean }) {
  const lang = useIdioma();
  // Recorded runs play at ×2 by default (labelled, real timings ÷ 2); ×1 shows the real pace.
  const [velocidad, setVelocidad] = useState<Velocidad>(2);
  const [sesion, dispatch] = useReducer(reductor, undefined, sesionVacia);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [grabado, setGrabado] = useState<string | null>(null);
  const [grabadas, setGrabadas] = useState<PreguntaGrabada[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const papeles = useRef<Record<string, HTMLElement | null>>({});
  const t = T[lang];


  const reproducir = useCallback(async (vel: Velocidad) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    dispatch({ tipo: "reiniciar" });
    setFoco(null);
    if (!muestra) return;
    try {
      const r = (await fetch(`/replays/${muestra}.json`).then((x) => x.json())) as Replay & { preguntas?: PreguntaGrabada[] };
      setGrabado(r.grabado);
      setGrabadas(r.preguntas);
      if (instantaneo) { for (const { ev } of r.eventos) dispatch({ tipo: "evento", ev }); return; }
      for (const { t, ev } of r.eventos) timers.current.push(setTimeout(() => dispatch({ tipo: "evento", ev }), t / vel));
    } catch {
      setError(lang === "es" ? "No se pudo cargar la muestra." : "Could not load the sample.");
    }
  }, [muestra, lang, instantaneo]);

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
  }, [muestra, vivo]);

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
  const preguntas = (grabadas?.length || vivo) ? <Preguntas sesion={sesion} lang={lang} onFoco={enfocarRefs} grabadas={grabadas} directo={!!vivo} /> : null;
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 sm:px-6">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="tinta"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" /><feComposite in="SourceGraphic" operator="in" /></filter>
      </svg>
      <header className="flex items-center justify-between gap-3 py-2">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
        <div className="flex items-center gap-2">
          {muestra ? (
            <>
              <span className="hidden rounded-full border border-linea bg-white/70 px-3 py-1 text-xs text-tinta-2 sm:inline">
                {t.muestraGrabada}{grabado ? ` · ${new Date(grabado).toLocaleDateString(lang === "es" ? "es-ES" : "en-GB")}` : ""}
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
              <button type="button" onClick={() => reproducir(velocidad)} className="min-h-[40px] rounded-full border border-linea bg-white px-3 text-sm">{t.repetir}</button>
            </>
          ) : (
            <span className="rounded-full bg-verde/10 px-3 py-1 text-xs font-medium text-verde">{lang === "es" ? "En vivo" : "Live"}</span>
          )}
          <BotonIdioma />
        </div>
      </header>
      {muestra && <p className="mb-4 text-xs text-apagado sm:hidden">{t.muestraGrabada}</p>}
      {muestra && !instantaneo && velocidad !== 1 && <p className="mb-2 text-xs text-apagado">{lang === "es" ? `Reproduciendo a ×${velocidad} (tiempos reales ÷ ${velocidad})` : `Playing at ×${velocidad} (real timings ÷ ${velocidad})`}</p>}
      {error && <p className="rounded-lg bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          {foto && <Escena foto={foto} sesion={sesion} lang={lang} />}
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
