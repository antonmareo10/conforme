"use client";
// The landing's case file loads after the page is interactive: it is below the fold and carries the
// claim desk's code (animation, proof image), which must not compete with the first screen.
import dynamic from "next/dynamic";

const Esqueleto = () => <div className="h-[620px] animate-[pulso_1.6s_ease-in-out_infinite] rounded-2xl border border-linea bg-white/60" aria-hidden />;
export const CasoDeMuestraPerezoso = dynamic(() => import("./CasoDeMuestra").then((m) => m.CasoDeMuestra), { ssr: false, loading: Esqueleto });
