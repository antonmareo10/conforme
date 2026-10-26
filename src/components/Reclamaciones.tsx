"use client";
// The agent's output: one case file per supplier with money at stake. What it checked on the paper
// (each step with the crop it looked at), what to write on the note before signing, and the claim,
// ready to send with the proof image cut from the supplier's own paper.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Aviso } from "@/lib/checks/types";
import type { Evidencia, Paso } from "@/lib/agente/herramientas";
import type { DocEstado, SesionEstado } from "@/lib/sesion/estado";
import { textoAviso, type Idioma } from "@/lib/sesion/textos";
import { formatCents } from "@/lib/numbers";
import { conDinero, reclamacion, reserva } from "@/lib/reclamacion";
import { imagenPrueba } from "@/lib/sesion/prueba-imagen";

const VEREDICTO: Record<string, Record<Idioma, string>> = {
  error_proveedor: { es: "Error del proveedor, confirmado en el papel", en: "Supplier error, confirmed on the paper" },
  celda_mal_leida: { es: "Celda mal leída, reparada", en: "Misread cell, repaired" },
  lectura_confirmada: { es: "Lectura confirmada", en: "Reading confirmed" },
  revisar: { es: "Mejor que lo mire una persona", en: "Better for a person to look" },
};
const CAMPO: Record<string, Record<Idioma, string>> = {
  cantidad: { es: "la cantidad", en: "the quantity" },
  precio_unitario: { es: "el precio", en: "the unit price" },
  importe: { es: "el importe", en: "the amount" },
  descuento_pct: { es: "el descuento", en: "the discount" },
};
const s1 = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** One step of the agent, in plain words, with what it saw. */
function textoPaso(p: Paso, ev: Evidencia | undefined, lang: Idioma, d: DocEstado): { que: string; vio?: string } {
  const es = lang === "es";
  const n = p.args.linea != null ? Number(p.args.linea) : null;
  const ampliado = ev?.datos?.ampliado ? (es ? " (no estaba en el recorte: miró la tabla entera)" : " (not in the crop: looked at the whole table)") : "";
  switch (p.herramienta) {
    case "releer_fila": {
      const r = ev?.datos?.relectura as Record<string, string | null> | undefined;
      const vio = r ? [r.cantidad, r.precio_unitario, r.importe].filter(Boolean).join(" · ") : undefined;
      return { que: (es ? `Releyó la línea ${n} ampliada` : `Re-read line ${n}, zoomed in`) + ampliado, vio: vio || (es ? "no se lee" : "unreadable") };
    }
    case "releer_celda":
      return { que: (es ? `Releyó ${CAMPO[String(p.args.campo)]?.es ?? "una celda"} de la línea ${n}` : `Re-read ${CAMPO[String(p.args.campo)]?.en ?? "a cell"} of line ${n}`) + ampliado, vio: ev?.texto ?? (es ? "no se lee" : "unreadable") };
    case "releer_total":
      return { que: es ? "Releyó el total ampliado" : "Re-read the total, zoomed in", vio: ev?.texto ?? undefined };
    case "historial_precio": {
      const ref = ev?.datos?.referencia as { mediana?: number } | null | undefined;
      const compras = (ev?.datos?.compras as unknown[] | undefined)?.length ?? 0;
      return { que: es ? `Sacó el historial de precios de la línea ${n}` : `Pulled the price history of line ${n}`, vio: ref?.mediana != null ? (es ? `${compras} compras · habitual ${formatCents(Math.round(ref.mediana * 100), lang)}` : `${compras} purchases · usual ${formatCents(Math.round(ref.mediana * 100), lang)}`) : undefined };
    }
    case "pedido": {
      const pe = ev?.datos?.pedido as { cantidad: number; unidad: string | null } | null | undefined;
      return { que: es ? `Miró el pedido de la línea ${n}` : `Checked the order for line ${n}`, vio: pe ? `${es ? "pedido" : "ordered"} ${pe.cantidad} ${pe.unidad ?? ""}` : es ? "sin pedido" : "no order on file" };
    }
    case "recontar_filas":
      return { que: es ? "Recontó las filas del papel" : "Recounted the rows on the paper", vio: ev?.datos?.filas != null ? String(ev.datos.filas) : undefined };
    case "cerrar":
      return { que: VEREDICTO[String(p.args.veredicto)]?.[lang] ?? String(p.args.veredicto) };
    case "cerrar_expediente": {
      const conf = d.expediente?.puntos.filter((x) => x.estado === "confirmada").length ?? 0;
      return { que: es ? `Expediente cerrado: ${conf} ${conf === 1 ? "reclamación confirmada" : "reclamaciones confirmadas"} en el papel` : `Claim file closed: ${conf} ${conf === 1 ? "claim" : "claims"} confirmed on the paper` };
    }
    default:
      return { que: p.herramienta };
  }
}

function Traza({ d, lang, onCrop }: { d: DocEstado; lang: Idioma; onCrop: (src: string, id: string) => void }) {
  const es = lang === "es";
  const reduce = useReducedMotion();
  const fases = [
    d.investigacion && d.investigacion.pasos.length ? { titulo: es ? "Investigó lo que no cuadraba" : "Investigated what didn't add up", f: d.investigacion } : null,
    d.expediente && d.expediente.pasos.length ? { titulo: es ? "Comprobó la reclamación en el papel" : "Checked the claim on the paper", f: d.expediente } : null,
  ].filter(Boolean) as { titulo: string; f: { pasos: Paso[]; evidencias: Evidencia[]; valido: boolean; ms: number } }[];
  if (!fases.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {fases.map(({ titulo, f }, k) => (
        <div key={k}>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-apagado">{titulo} · <span className="cifras normal-case tracking-normal">{f.pasos.length} {es ? "pasos" : "steps"} · {s1(f.ms)}</span></p>
          <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-linea pl-3">
            {f.pasos.map((p, i) => {
              const ev = f.evidencias.find((e) => e.id === p.evidenciaId);
              const { que, vio } = textoPaso(p, ev, lang, d);
              const cierre = p.herramienta.startsWith("cerrar");
              return (
                <motion.li key={p.n} initial={reduce ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-[40px] items-center gap-3 text-sm">
                  {ev?.miniatura ? (
                    <button type="button" onClick={() => onCrop(ev.miniatura!, ev.id)} className="shrink-0 rounded border border-linea transition hover:border-sello"
                      aria-label={es ? `Ver ampliado el recorte ${ev.id}` : `Show crop ${ev.id} enlarged`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ev.miniatura} alt="" className="h-10 w-28 rounded object-cover object-left" />
                    </button>
                  ) : (
                    <span className={`flex h-10 w-28 shrink-0 items-center justify-center gap-1.5 rounded text-[11px] ${cierre ? "text-verde" : "bg-papel-2 text-apagado"}`} aria-hidden>
                      {cierre ? (
                        <svg viewBox="0 0 16 16" className="h-5 w-5"><circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.12" /><path d="M4.8 8.3 7 10.4l4.3-4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : es ? "registro" : "record"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 leading-snug text-tinta-2">
                    <span className={cierre ? "font-medium text-tinta" : ""}>{que}</span>
                    {vio && <> → <b className="cifras font-semibold text-tinta">{vio}</b></>}
                    {ev && <span className="ml-1.5 rounded bg-papel-2 px-1 text-[10px] text-tinta-2">{ev.id}</span>}
                    {cierre && <span className={`mt-1 block w-fit rounded px-1.5 py-0.5 text-[11px] ${f.valido ? "bg-verde/10 text-verde" : "bg-rojo/10 text-rojo"}`}>{f.valido ? (es ? "validado por el código" : "validated by code") : es ? "rechazado por el código" : "rejected by code"}</span>}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

type Envio = "listo" | "compartido" | "descargado" | "copiado" | "error";

export function Caso({ d, lang, onFoco, abierto: abiertoInicial }: { d: DocEstado; lang: Idioma; onFoco?: (avisos: Aviso[]) => void; abierto: boolean }) {
  const es = lang === "es";
  const reduce = useReducedMotion();
  const items = conDinero(d.avisos);
  const total = items.reduce((s, a) => s + a.centimos, 0);
  const confirmados = items.filter((a) => a.datos.evidencia != null || a.codigo === "DUPLICADO");
  const todoConfirmado = confirmados.length === items.length;
  const producto = (a: Aviso) => (a.lineaIdx != null ? d.leido?.lineas[a.lineaIdx]?.descripcion.texto ?? null : null);
  const mensaje = reclamacion(d.avisos, { numero: d.numero, fecha: d.fecha, proveedor: d.proveedor }, d.leido, lang) ?? "";
  const nota = reserva(d.avisos, d.leido, lang);
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [verMensaje, setVerMensaje] = useState(false);
  const [png, setPng] = useState<{ blob: Blob; url: string; lang: Idioma } | null>(null);
  const [crop, setCrop] = useState<{ src: string; id: string } | null>(null);
  const [verPrueba, setVerPrueba] = useState(false);
  const [envio, setEnvio] = useState<Envio>("listo");
  const firma = `${d.docId}-${items.map((a) => `${a.codigo}${a.centimos}`).join()}-${lang}`;

  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    imagenPrueba(d, lang).then((blob) => {
      if (!vivo || !blob) return;
      url = URL.createObjectURL(blob);
      setPng({ blob, url, lang });
    }).catch(() => {});
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
    // The image depends on the claim's content and language, not on object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, d.imagen]);

  const modal = (verPrueba && !!png) || !!crop;
  useEffect(() => {
    if (!modal) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setVerPrueba(false); setCrop(null); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [modal]);

  const nombre = `${es ? "reclamacion" : "claim"}-${(d.numero ?? d.docId).replace(/[^\w-]/g, "")}.png`;
  const avisar = (e: Envio) => { setEnvio(e); setTimeout(() => setEnvio("listo"), 2600); };
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const descargar = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png.url; a.download = nombre; a.click();
  };
  const enviar = async () => {
    const file = png ? new File([png.blob], nombre, { type: "image/png" }) : null;
    const datos: ShareData = { title: es ? `Reclamación · albarán ${d.numero ?? ""}` : `Claim · delivery note ${d.numero ?? ""}`, text: mensaje, ...(file ? { files: [file] } : {}) };
    try {
      // The share sheet (WhatsApp, Mail…) on phones; on a desktop, saving the image and copying the text is clearer.
      const tactil = window.matchMedia?.("(pointer: coarse)").matches;
      if (tactil && file && navigator.canShare?.(datos)) { await navigator.share(datos); avisar("compartido"); return; }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    // No share sheet with files here (most desktops): save the image and copy the message.
    descargar();
    avisar((await copiar(mensaje)) ? "descargado" : "error");
  };
  const asunto = encodeURIComponent(es ? `Albarán ${d.numero ?? ""}: reclamación de ${formatCents(total, lang)}` : `Delivery note ${d.numero ?? ""}: claim for ${formatCents(total, lang)}`);

  return (
    <motion.article layout={!reduce} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-linea bg-white" aria-label={es ? `Reclamación a ${d.proveedor ?? ""}` : `Claim to ${d.proveedor ?? ""}`}>
      <header className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-apagado">{es ? "Reclamación lista" : "Claim ready"}</p>
          <h3 className="mt-0.5 truncate font-serif text-lg font-semibold leading-tight">{d.proveedor ?? d.docId}</h3>
          <p className="text-xs text-apagado">{es ? "Albarán nº" : "Note no."} {d.numero ?? "-"}</p>
        </div>
        <button type="button" onClick={() => onFoco?.(items)} className="cifras shrink-0 rounded-md px-1 font-serif text-2xl font-semibold text-rojo underline decoration-rotulador decoration-4 underline-offset-4"
          aria-label={`${formatCents(total, lang)}: ${es ? "ver en el papel" : "show on the paper"}`}>
          {formatCents(total, lang)}
        </button>
      </header>

      <div className="px-4">
        <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${todoConfirmado ? "bg-verde/10 text-verde" : "bg-rojo/10 text-rojo"}`}>
          {todoConfirmado ? (
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : <span aria-hidden>!</span>}
          {!todoConfirmado
            ? es ? "Sin confirmar en el papel: revísalo antes de enviar" : "Not confirmed on the paper: check before sending"
            : items.every((a) => a.codigo === "DUPLICADO")
              ? es ? "Comprobado por el código contra los albaranes que ya registraste" : "Checked by code against the notes you already logged"
              : items.some((a) => a.codigo === "DUPLICADO")
                ? es ? "Confirmado en el papel por el agente y contra tu registro · validado por el código" : "Confirmed on the paper by the agent and against your log · validated by code"
                : es ? "El agente lo confirmó en el papel · validado por el código" : "The agent confirmed it on the paper · validated by code"}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px] leading-snug text-tinta">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rojo" aria-hidden />
              <button type="button" onClick={() => onFoco?.([a])} className="text-left hover:underline hover:decoration-rotulador hover:decoration-4 hover:underline-offset-4">
                {textoAviso(a, lang, producto(a))}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* The proof that goes with the message. */}
      <div className="mt-4 px-4">
        <button type="button" onClick={() => setVerPrueba(true)} disabled={!png}
          className="group relative block w-full overflow-hidden rounded-xl border border-linea bg-papel text-left transition hover:border-tinta/40 disabled:opacity-60">
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png.url} alt={es ? "Prueba que se adjunta: las líneas reclamadas, cortadas del albarán, con la cuenta" : "Proof attached: the claimed lines cut from the note, with the arithmetic"} className="max-h-44 w-full object-cover object-top" />
          ) : <div className="h-24 animate-[pulso_1.6s_ease-in-out_infinite] bg-papel-2" />}
          <span className="absolute right-2 top-2 rounded-full bg-tinta/85 px-2.5 py-1 text-[11px] font-medium text-papel transition group-hover:bg-tinta">{es ? "Prueba adjunta · ver" : "Proof attached · view"}</span>
        </button>
      </div>

      {nota && (
        <div className="mx-4 mt-4 rounded-xl border border-dashed border-tinta/25 bg-papel/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-apagado">{es ? "Antes de firmar, escribe en el albarán" : "Before you sign, write on the note"}</p>
          <p className="mt-1 font-serif text-[17px] italic leading-snug text-sello">«{nota}»</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 px-4">
        <button type="button" onClick={enviar} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-tinta px-4 text-sm font-medium text-papel transition active:scale-[0.97]">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M2 8.5 14 2l-3.5 12-3-4.5L2 8.5Zm5.5 1L14 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          {es ? "Enviar con la prueba" : "Send with the proof"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-full border border-tinta/20 px-4 text-sm font-medium transition hover:border-tinta">WhatsApp</a>
        <a href={`mailto:?subject=${asunto}&body=${encodeURIComponent(mensaje)}`} className="inline-flex min-h-[44px] items-center rounded-full border border-tinta/20 px-4 text-sm font-medium transition hover:border-tinta">{es ? "Correo" : "Email"}</a>
        <button type="button" onClick={() => setVerMensaje((v) => !v)} aria-expanded={verMensaje} className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-tinta-2 underline decoration-linea decoration-2 underline-offset-4 hover:text-tinta">
          {verMensaje ? (es ? "Ocultar mensaje" : "Hide message") : es ? "Ver mensaje" : "Read message"}
        </button>
      </div>
      <p className="min-h-[24px] px-4 pt-1 text-xs text-verde" role="status" aria-live="polite">
        {envio === "compartido" ? (es ? "Enviado." : "Shared.") : envio === "descargado" ? (es ? "Prueba guardada y mensaje copiado: pégalo en WhatsApp o en el correo y adjunta la imagen." : "Proof saved and message copied: paste it into WhatsApp or email and attach the image.") : envio === "copiado" ? (es ? "Copiado." : "Copied.") : envio === "error" ? (es ? "Prueba guardada. No se pudo copiar el mensaje: ábrelo con «Ver mensaje»." : "Proof saved. Could not copy the message: open it with “Read message”.") : ""}
      </p>
      <AnimatePresence initial={false}>
        {verMensaje && (
          <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="mx-4 mb-2 rounded-xl bg-papel p-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-tinta">{mensaje}</pre>
              <button type="button" onClick={async () => avisar((await copiar(mensaje)) ? "copiado" : "error")} className="mt-2 min-h-[40px] rounded-lg border border-tinta/20 px-3 text-sm font-medium hover:border-tinta">
                {es ? "Copiar" : "Copy"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(d.investigacion?.pasos.length || d.expediente?.pasos.length) ? (
        <div className="mt-2 border-t border-linea">
          <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-sm font-medium text-tinta">
            {es ? "Qué miró el agente antes de reclamar" : "What the agent checked before claiming"}
            <svg viewBox="0 0 16 16" aria-hidden className={`h-4 w-4 transition ${abierto ? "rotate-180" : ""}`}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <AnimatePresence initial={false}>
            {abierto && (
              <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <div className="px-4 pb-4"><Traza d={d} lang={lang} onCrop={(src, id) => setCrop({ src, id })} /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : null}

      <AnimatePresence>
        {(verPrueba && png) || crop ? (
          <motion.div key="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/70 p-4" onClick={() => { setVerPrueba(false); setCrop(null); }}
            role="dialog" aria-modal="true" aria-label={crop ? (es ? `Recorte ${crop.id}` : `Crop ${crop.id}`) : es ? "Prueba que se adjunta" : "Proof attached"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={crop ? crop.src : png!.url} alt={crop ? (es ? "Recorte ampliado que releyó el agente" : "Zoomed crop the agent re-read") : es ? "Prueba de la reclamación" : "Claim evidence"} className="max-h-[88vh] w-auto max-w-full rounded-lg bg-white object-contain shadow-2xl" />
            <button type="button" autoFocus className="absolute right-4 top-4 min-h-[44px] min-w-[44px] rounded-full bg-white text-lg font-semibold" aria-label={es ? "Cerrar" : "Close"}>×</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

/** A note whose claim is being checked right now: honest waiting state, no numbers yet. */
function Preparando({ d, lang }: { d: DocEstado; lang: Idioma }) {
  const es = lang === "es";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-linea bg-white/60 p-4 text-sm text-tinta-2" role="status">
      <span className="h-2.5 w-2.5 shrink-0 animate-[pulso_1.2s_ease-in-out_infinite] rounded-full bg-sello" aria-hidden />
      <span>
        <b className="font-medium text-tinta">{d.proveedor ?? (es ? "Un albarán" : "A note")}</b>
        {" · "}
        {d.investigando
          ? es ? "el agente está releyendo en el papel lo que no cuadra" : "the agent is re-reading on the paper what doesn't add up"
          : es ? "el agente está confirmando en el papel cada cifra antes de reclamar" : "the agent is confirming every figure on the paper before claiming"}
      </span>
    </div>
  );
}

export function Reclamaciones({ sesion, lang, onFoco }: { sesion: SesionEstado; lang: Idioma; onFoco: (avisos: Aviso[]) => void }) {
  const es = lang === "es";
  const docs = sesion.orden.map((id) => sesion.docs[id]);
  const listos = docs.filter((d) => !d.provisional && conDinero(d.avisos).length);
  const preparando = docs.filter((d) => (d.reclamando || d.investigando) && (d.provisional || !d.sello));
  const retenidas = docs.filter((d) => d.expediente?.puntos.some((p) => p.estado === "retenida"));
  const primero = listos.find((d) => d.investigacion?.veredicto === "error_proveedor")?.docId ?? listos[0]?.docId;
  if (!listos.length && !preparando.length && !retenidas.length) return null;
  return (
    <section aria-labelledby="reclamaciones" className="flex flex-col gap-3">
      <h2 id="reclamaciones" className="flex items-baseline justify-between gap-3 text-sm font-medium uppercase tracking-[0.12em] text-apagado">
        <span>{es ? "Lo que ha preparado el agente" : "What the agent prepared"}</span>
        {listos.length > 0 && <span className="cifras normal-case tracking-normal">{listos.length} {es ? (listos.length === 1 ? "reclamación" : "reclamaciones") : listos.length === 1 ? "claim" : "claims"}</span>}
      </h2>
      {listos.map((d) => <Caso key={d.docId} d={d} lang={lang} onFoco={onFoco} abierto={d.docId === primero} />)}
      {preparando.map((d) => <Preparando key={d.docId} d={d} lang={lang} />)}
      {retenidas.map((d) => (
        <div key={`r-${d.docId}`} className="rounded-2xl border border-linea bg-white/70 p-4 text-sm text-tinta-2">
          <b className="font-medium text-tinta">{d.proveedor ?? d.docId}</b> · {es ? "reclamación retenida: la relectura ampliada no coincide con la primera lectura. Míralo antes de reclamar." : "claim held back: the zoomed re-read does not match the first reading. Take a look before claiming."}
          {d.expediente!.puntos.filter((p) => p.estado === "retenida").map((p, i) => (
            <span key={i} className="cifras mt-1 block text-xs text-apagado">{es ? "Línea" : "Line"} {p.lineaIdx + 1}: {p.contradiccion?.primera} → {p.contradiccion?.relectura}</span>
          ))}
        </div>
      ))}
    </section>
  );
}
