"use client";
// Capture: take a photo or upload up to 3. Images are oriented and shrunk on the device (long side
// 2048 px, JPEG 0.85) before upload, then the live session runs on the same screen.
import { useState } from "react";
import Link from "next/link";
import { Sesion } from "./Sesion";
import { BotonIdioma, L, useIdioma } from "./Idioma";

async function preparar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const escala = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.85));
}

export function Escanear() {
  const lang = useIdioma();
  const [fotos, setFotos] = useState<Blob[] | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegir = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setPreparando(true);
    try {
      const lista = [...files].slice(0, 3);
      const blobs = await Promise.all(lista.map(preparar));
      setUrl(URL.createObjectURL(blobs[0]));
      setFotos(blobs);
    } catch {
      setError(lang === "es" ? "No he podido abrir esa imagen. Prueba con una foto JPEG o PNG." : "I couldn't open that image. Try a JPEG or PNG photo.");
    } finally {
      setPreparando(false);
    }
  };

  if (fotos && url) return <Sesion foto={url} vivo={fotos} />;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
        <BotonIdioma />
      </header>
      <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight"><L es="Haz una foto a tus albaranes" en="Photograph your delivery notes" /></h1>
      <p className="mt-3 text-lg text-tinta-2"><L es="Caben varios albaranes en una foto. Mejor con luz y el papel entero." en="Several notes fit in one photo. Best with good light and the whole page in frame." /></p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-tinta p-6 text-center text-papel transition active:scale-[0.98]">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" /></svg>
          <span className="text-lg font-medium"><L es="Hacer una foto" en="Take a photo" /></span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => elegir(e.target.files)} />
        </label>
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-tinta/30 bg-white/60 p-6 text-center transition hover:border-tinta active:scale-[0.98]">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="text-lg font-medium"><L es="Subir imágenes" en="Upload images" /></span>
          <span className="text-sm text-apagado"><L es="hasta 3" en="up to 3" /></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => elegir(e.target.files)} />
        </label>
      </div>
      {preparando && <p className="mt-6 text-sm text-tinta-2"><L es="Preparando las fotos…" en="Preparing the photos…" /></p>}
      {error && <p className="mt-6 rounded-lg bg-rojo/10 p-3 text-sm text-rojo">{error}</p>}
      <p className="mt-10 text-sm text-apagado">
        <L es="¿Sin albaranes a mano? " en="No delivery notes at hand? " />
        <Link href="/sesion?muestra=encimera" className="font-medium text-tinta underline decoration-rotulador decoration-4 underline-offset-4"><L es="Mira una muestra grabada" en="Watch a recorded sample" /></Link>
      </p>
      <p className="mt-3 text-xs text-apagado"><L es="Las fotos se analizan con la API de Meta en modo estándar y no se guardan en ningún servidor de Conforme." en="Photos are analysed with Meta's API in standard mode and are not stored on any Conforme server." /></p>
    </div>
  );
}
