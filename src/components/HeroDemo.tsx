"use client";
// Landing scene: the recorded run of the counter sample, played silently in a loop (×3, labelled).
// Outlines from SAM, then each note's stamp, then the money at stake counting up to the real value.
import { useEffect, useReducer, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { reducir, sesionVacia, type SesionEstado } from "@/lib/sesion/estado";
import type { Evento } from "@/lib/pipeline";
import { SELLO } from "@/lib/sesion/textos";
import { Escena } from "./Escena";
import { Cifra } from "./Panel";
import { useIdioma } from "./Idioma";

const VEL = 3;
type A = { tipo: "ev"; ev: Evento } | { tipo: "reset" } | { tipo: "todo"; evs: Evento[] };
const red = (s: SesionEstado, a: A): SesionEstado => (a.tipo === "reset" ? sesionVacia() : a.tipo === "todo" ? a.evs.reduce(reducir, sesionVacia()) : reducir(s, a.ev));

export function HeroDemo() {
  const lang = useIdioma();
  const reduce = useReducedMotion();
  const [s, dispatch] = useReducer(red, undefined, sesionVacia);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = (await fetch("/replays/encimera.json").then((x) => x.json())) as { eventos: { t: number; ev: Evento }[] };
      if (!vivo) return;
      if (reduce) { dispatch({ tipo: "todo", evs: r.eventos.map((e) => e.ev) }); return; }
      const duracion = r.eventos[r.eventos.length - 1].t / VEL;
      const ciclo = () => {
        dispatch({ tipo: "reset" });
        for (const { t, ev } of r.eventos) timers.current.push(setTimeout(() => dispatch({ tipo: "ev", ev }), 400 + t / VEL));
        timers.current.push(setTimeout(ciclo, duracion + 5000));
      };
      ciclo();
    })().catch(() => {});
    const ts = timers.current;
    return () => { vivo = false; ts.forEach(clearTimeout); };
  }, [reduce]);

  const foto = s.fotos[0];
  const docs = s.orden.map((id) => s.docs[id]);
  const enJuego = s.resumen?.enJuegoCentimos ?? docs.filter((d) => !d.provisional).flatMap((d) => d.avisos).filter((a) => a.clase === "dinero").reduce((t, a) => t + a.centimos, 0);

  return (
    <div className="relative">
      <Escena foto="/muestras/encimera/escena.jpg" sesion={s} lang={lang} />
      {foto && docs.map((d) => d.caja && d.sello && (
        <motion.div key={d.docId} className="pointer-events-none absolute" style={{ left: `${((d.caja.x + d.caja.w * 0.5) / foto.width) * 100}%`, top: `${((d.caja.y + d.caja.h * 0.62) / foto.height) * 100}%` }}
          initial={reduce ? false : { scale: 1.25, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: d.provisional ? 0.45 : 0.95, rotate: -8 }} transition={{ type: "spring", stiffness: 520, damping: 22 }}>
          <span className="block -translate-x-1/2 whitespace-nowrap rounded-md border-[2.5px] bg-white/75 px-1.5 py-0.5 font-serif text-[clamp(0.5rem,1.15vw,0.85rem)] font-semibold tracking-[0.08em]"
            style={{ color: d.sello === "CONFORME" ? "var(--sello-azul)" : d.sello === "CON_RESERVAS" ? "var(--rojo)" : "var(--apagado)", borderColor: "currentColor" }}>
            {SELLO[d.sello][lang]}
          </span>
        </motion.div>
      ))}
      <div className="absolute bottom-3 left-3 rounded-xl bg-white/90 px-4 py-2 shadow-lg backdrop-blur sm:bottom-5 sm:left-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-apagado">{lang === "es" ? "€ en juego" : "€ at stake"}</div>
        <div className="font-serif text-2xl font-semibold text-rojo sm:text-4xl"><Cifra cents={enJuego} lang={lang} /></div>
      </div>
      <div className="absolute right-3 top-3 rounded-full bg-tinta/80 px-3 py-1 text-[11px] text-papel sm:right-5 sm:top-5">
        {lang === "es" ? "Muestra grabada · datos ficticios · fondo de Muse Image · ×3" : "Recorded sample · fictional data · background by Muse Image · ×3"}
      </div>
    </div>
  );
}
