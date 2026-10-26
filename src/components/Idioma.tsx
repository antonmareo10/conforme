"use client";
// Language without flicker: an inline script in <head> sets <html data-lang> before paint (saved choice,
// else the browser language); both texts are in the HTML and CSS shows one. Client components that
// format numbers read the same attribute and listen for changes.
import { useEffect, useState } from "react";
import type { Idioma } from "@/lib/sesion/textos";

export const SCRIPT_IDIOMA = `try{var l=localStorage.getItem('conforme.lang');if(l!=='es'&&l!=='en'){l=(navigator.language||'es').toLowerCase().indexOf('es')===0?'es':'en'}document.documentElement.setAttribute('data-lang',l);document.documentElement.lang=l}catch(e){}`;

export function L({ es, en }: { es: React.ReactNode; en: React.ReactNode }) {
  return (
    <>
      <span data-l="es">{es}</span>
      <span data-l="en">{en}</span>
    </>
  );
}

export function idiomaActual(): Idioma {
  if (typeof document === "undefined") return "es";
  return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "es";
}

export function fijarIdioma(l: Idioma) {
  document.documentElement.setAttribute("data-lang", l);
  document.documentElement.lang = l;
  try { localStorage.setItem("conforme.lang", l); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("conforme-lang", { detail: l }));
}

/** Current language for client components; follows the toggle. */
export function useIdioma(): Idioma {
  const [lang, setLang] = useState<Idioma>("es");
  useEffect(() => {
    const sync = () => setLang(idiomaActual());
    const id = setTimeout(sync, 0);
    window.addEventListener("conforme-lang", sync);
    return () => { clearTimeout(id); window.removeEventListener("conforme-lang", sync); };
  }, []);
  return lang;
}

export function BotonIdioma({ className = "" }: { className?: string }) {
  const lang = useIdioma();
  return (
    <button type="button" onClick={() => fijarIdioma(lang === "es" ? "en" : "es")}
      className={`min-h-[40px] min-w-[44px] rounded-full bg-tinta px-3 text-sm font-semibold text-papel ${className}`}
      aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}>
      {lang === "es" ? "EN" : "ES"}
    </button>
  );
}
