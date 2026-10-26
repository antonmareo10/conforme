"use client";
// One real case file from the recorded counter sample, on the landing page: what the agent hands
// over, without waiting for the replay. Same component and same data as the session screen.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocEstado } from "@/lib/sesion/estado";
import { cargarReplay, estadoFinal } from "@/lib/sesion/replay";
import { Caso } from "./Reclamaciones";
import { useIdioma } from "./Idioma";

export function CasoDeMuestra({ docId = "doc3" }: { docId?: string }) {
  const lang = useIdioma();
  const router = useRouter();
  const [d, setD] = useState<DocEstado | null>(null);
  useEffect(() => {
    let vivo = true;
    cargarReplay("encimera").then((r) => { if (vivo) setD(estadoFinal(r).docs[docId] ?? null); }).catch(() => {});
    return () => { vivo = false; };
  }, [docId]);
  if (!d) return <div className="h-[520px] animate-[pulso_1.6s_ease-in-out_infinite] rounded-2xl border border-linea bg-white/60" aria-hidden />;
  return (
    <div>
      <Caso d={d} lang={lang} abierto onFoco={() => router.push("/sesion?muestra=encimera")} />
      <p className="mt-2 text-xs text-apagado">{lang === "es" ? "De la muestra grabada · datos ficticios" : "From the recorded sample · fictional data"}</p>
    </div>
  );
}
