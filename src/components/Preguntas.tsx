"use client";
// "Ask your delivery notes": voice (Muse Voice Transcribe) or text → intent (Muse Spark) → the answer
// is computed in the browser from the session's notes, and its lines light up on the papers.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SesionEstado } from "@/lib/sesion/estado";
import { responder, type Consulta, type Referencia, type Respuesta } from "@/lib/preguntas";
import { fraseRespuesta, type Idioma } from "@/lib/sesion/textos";
import { aWav } from "@/lib/audio";
import { Cifra } from "./Panel";

export interface PreguntaGrabada { es: string; en: string; consulta: Consulta }

const MAX_MS = 15_000;

export function Preguntas({ sesion, lang, onFoco, grabadas, directo }: { sesion: SesionEstado; lang: Idioma; onFoco: (refs: Referencia[]) => void; grabadas?: PreguntaGrabada[]; directo: boolean }) {
  const [texto, setTexto] = useState("");
  const [oido, setOido] = useState<string | null>(null);
  const [resp, setResp] = useState<Respuesta | null>(null);
  const [estado, setEstado] = useState<"listo" | "grabando" | "pensando">("listo");
  const [nivel, setNivel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; tope: ReturnType<typeof setTimeout> } | null>(null);

  const docs = sesion.orden.map((id) => sesion.docs[id]).filter((d) => d.leido && !d.provisional);
  const listo = docs.length > 0;
  const proveedores = [...new Set(docs.map((d) => d.proveedor).filter((p): p is string => !!p))];
  const productos = [...new Set(docs.flatMap((d) => d.leido!.lineas.map((l) => l.descripcion.texto).filter((x): x is string => !!x)))];

  const contestar = (c: Consulta) => {
    const r = responder(c, docs.map((d) => ({ docId: d.docId, leido: d.leido!, avisos: d.avisos })));
    setResp(r);
    if (r.referencias.length) onFoco(r.referencias);
  };

  const preguntar = async (body: { texto?: string; audio?: Blob }) => {
    setError(null);
    setEstado("pensando");
    try {
      const fd = new FormData();
      if (body.audio) fd.append("audio", body.audio, "pregunta.wav");
      if (body.texto) fd.append("texto", body.texto);
      fd.append("proveedores", JSON.stringify(proveedores));
      fd.append("productos", JSON.stringify(productos));
      const r = await fetch("/api/pregunta", { method: "POST", body: fd });
      const j = (await r.json()) as { transcripcion?: string | null; texto?: string; consulta?: Consulta; error?: string };
      if (!r.ok || !j.consulta) throw new Error(j.error ?? `HTTP ${r.status}`);
      setOido(j.transcripcion ?? j.texto ?? null);
      if (j.transcripcion) setTexto(j.transcripcion);
      contestar(j.consulta);
    } catch {
      setError(lang === "es" ? "No he podido entender la pregunta ahora. Prueba otra vez o escríbela." : "I couldn't process the question right now. Try again or type it.");
    } finally {
      setEstado("listo");
    }
  };

  const parar = () => {
    const r = rec.current;
    if (!r) return;
    clearTimeout(r.tope);
    cancelAnimationFrame(r.raf);
    if (r.mr.state !== "inactive") r.mr.stop();
  };

  const grabar = async () => {
    if (estado === "grabando") return parar();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const datos = new Uint8Array(an.fftSize);
      const medir = () => {
        an.getByteTimeDomainData(datos);
        let s = 0;
        for (const v of datos) s += ((v - 128) / 128) ** 2;
        setNivel(Math.min(1, Math.sqrt(s / datos.length) * 4));
        if (rec.current) rec.current.raf = requestAnimationFrame(medir);
      };
      const mr = new MediaRecorder(stream);
      const trozos: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && trozos.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
        rec.current = null;
        setNivel(0);
        try {
          const wav = await aWav(new Blob(trozos, { type: mr.mimeType }));
          await preguntar({ audio: wav });
        } catch {
          setEstado("listo");
          setError(lang === "es" ? "No he podido procesar el audio. Puedes escribir la pregunta." : "I couldn't process the audio. You can type the question.");
        }
      };
      rec.current = { mr, stream, ctx, raf: 0, tope: setTimeout(parar, MAX_MS) };
      mr.start();
      setEstado("grabando");
      rec.current.raf = requestAnimationFrame(medir);
    } catch {
      setError(lang === "es" ? "Sin permiso para el micrófono. Puedes escribir la pregunta." : "No microphone access. You can type the question.");
    }
  };

  useEffect(() => () => parar(), []);

  if (!listo) return null;
  const sugerencias = grabadas?.length ? grabadas : [
    { es: "¿Cuánto he pagado de más este mes?", en: "How much have I overpaid this month?", consulta: null },
    { es: "¿Qué ha subido de precio?", en: "What went up in price?", consulta: null },
  ];

  return (
    <section className="rounded-2xl border border-linea bg-white/70 p-5" aria-labelledby="preguntas">
      <h2 id="preguntas" className="font-serif text-xl font-semibold">{lang === "es" ? "Pregunta a tus albaranes" : "Ask your delivery notes"}</h2>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim() && directo) preguntar({ texto: texto.trim() }); }}>
        <button type="button" onClick={grabar} disabled={!directo || estado === "pensando"}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-papel transition active:scale-95 disabled:opacity-40 ${estado === "grabando" ? "bg-rojo" : "bg-tinta"}`}
          aria-label={estado === "grabando" ? (lang === "es" ? "Parar y preguntar" : "Stop and ask") : (lang === "es" ? "Preguntar con la voz" : "Ask with your voice")}>
          {estado === "grabando" && <span className="absolute inset-0 rounded-full bg-rojo/40" style={{ transform: `scale(${1 + nivel * 0.6})`, transition: "transform 80ms linear" }} aria-hidden />}
          <svg viewBox="0 0 24 24" className="relative h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            {estado === "grabando" ? <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" /></>}
          </svg>
        </button>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!directo}
          placeholder={directo ? (lang === "es" ? "Escribe o di tu pregunta" : "Type or say your question") : (lang === "es" ? "En esta muestra, toca una pregunta" : "In this sample, tap a question")}
          className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-linea bg-white px-3 text-[15px] outline-none focus:border-sello disabled:bg-papel-2/50" aria-label={lang === "es" ? "Pregunta" : "Question"} />
      </form>
      {estado === "grabando" && <p className="mt-2 text-xs text-rojo">{lang === "es" ? "Escuchando… toca otra vez para preguntar (máx. 15 s)" : "Listening… tap again to ask (max 15 s)"}</p>}
      {estado === "pensando" && <p className="mt-2 text-xs text-tinta-2">{lang === "es" ? "Entendiendo la pregunta…" : "Understanding the question…"}</p>}
      {error && <p className="mt-2 text-sm text-rojo">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {sugerencias.map((s) => (
          <button key={s.es} type="button" disabled={estado !== "listo" || (!s.consulta && !directo)}
            onClick={() => { setTexto(s[lang]); setOido(null); if (s.consulta) contestar(s.consulta); else preguntar({ texto: s[lang] }); }}
            className="min-h-[36px] rounded-full border border-linea bg-papel px-3 text-left text-sm text-tinta-2 transition hover:border-sello hover:text-sello disabled:opacity-50">
            {s[lang]}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {resp && (
          <motion.div key={JSON.stringify(resp.consulta)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-xl bg-papel p-4">
            {oido && <p className="text-xs text-apagado">{lang === "es" ? "He oído:" : "I heard:"} «{oido}»</p>}
            {resp.cifraCentimos != null && <div className="mt-1 font-serif text-4xl font-semibold text-tinta"><Cifra cents={resp.cifraCentimos} lang={lang} /></div>}
            <p className="mt-1 text-[15px] leading-snug text-tinta">{fraseRespuesta(resp, lang)}</p>
            {resp.referencias.length > 0 && (
              <button type="button" onClick={() => onFoco(resp.referencias)} className="mt-3 min-h-[36px] rounded-lg bg-tinta px-3 text-sm font-medium text-papel active:scale-[0.97]">
                {lang === "es" ? `Ver en el papel (${resp.referencias.length})` : `Show on the paper (${resp.referencias.length})`}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!directo && <p className="mt-3 text-xs text-apagado">{lang === "es" ? "Muestra grabada: las preguntas de ejemplo usan intenciones grabadas; las cifras se calculan aquí, ahora." : "Recorded sample: the example questions use recorded intents; the figures are computed here, now."}</p>}
    </section>
  );
}
