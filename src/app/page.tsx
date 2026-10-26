import Link from "next/link";
import { BotonIdioma, L } from "@/components/Idioma";
import { HeroDemo } from "@/components/HeroDemo";
import { pruebaReal } from "@/lib/prueba";

export default function Home() {
  const prueba = pruebaReal();
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <span className="font-serif text-2xl font-semibold tracking-tight">Conforme</span>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/como" className="hidden min-h-[40px] items-center rounded-full px-3 text-tinta-2 hover:text-tinta sm:inline-flex"><L es="Cómo funciona" en="How it works" /></Link>
            <Link href="/eval" className="hidden min-h-[40px] items-center rounded-full px-3 text-tinta-2 hover:text-tinta sm:inline-flex"><L es="Cómo lo medimos" en="How we measure" /></Link>
            <BotonIdioma />
          </nav>
        </header>

        <section className="grid items-center gap-8 pb-12 pt-2 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pt-8">
          <div className="order-2 lg:order-1">
            <h1 className="font-serif text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.05] tracking-tight">
              <L es="Antes de firmar el albarán, mira qué te están cobrando." en="Before you sign the delivery note, see what you're being charged." />
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-tinta-2">
              <L es="Una foto de tus albaranes. Conforme lee cada línea, comprueba cada euro y te enseña en el papel dónde está el problema."
                en="One photo of your delivery notes. Conforme reads every line, checks every euro and shows you on the paper where the problem is." />
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sesion?muestra=encimera" className="group inline-flex min-h-[48px] items-center gap-2 rounded-full bg-tinta px-6 text-base font-medium text-papel transition active:scale-[0.97]">
                <L es="Probar con una muestra" en="Try a sample" />
                <span aria-hidden className="transition group-hover:translate-x-1">→</span>
              </Link>
              <Link href="/escanear" className="inline-flex min-h-[48px] items-center rounded-full border border-tinta/25 bg-white/60 px-6 text-base font-medium text-tinta transition hover:border-tinta active:scale-[0.97]">
                <L es="Hacer una foto" en="Take a photo" />
              </Link>
            </div>
            {prueba && (
              <Link href="/eval" className="cifras mt-8 inline-flex flex-wrap items-center gap-x-2 rounded-lg border border-linea bg-white/60 px-4 py-2 text-sm text-tinta-2 hover:border-tinta/40">
                <L es={`Medido en ${prueba.albaranes} albaranes reales de un restaurante familiar`} en={`Measured on ${prueba.albaranes} real delivery notes from a family restaurant`} />
                <span>·</span>
                <L es={`${prueba.pctCentimo.toLocaleString("es-ES")} % de líneas al céntimo`} en={`${prueba.pctCentimo}% of lines to the cent`} />
                <span>·</span>
                <L es={`${prueba.okSilencioso} OK silenciosos`} en={`${prueba.okSilencioso} silent OKs`} />
                <span className="font-medium text-tinta underline decoration-rotulador decoration-4 underline-offset-4"><L es="ver cómo" en="see how" /></span>
              </Link>
            )}
          </div>
          <div className="order-1 lg:order-2">
            <HeroDemo />
          </div>
        </section>

        <section className="grid gap-4 border-t border-linea py-10 sm:grid-cols-2" aria-label="Muestras">
          {[
            { href: "/sesion?muestra=encimera", img: "/muestras/encimera/escena.jpg", es: ["Tres albaranes en la encimera", "Una foto, tres proveedores: una subida, una falta y un error del proveedor que el agente confirma en el papel."], en: ["Three notes on the counter", "One photo, three suppliers: a price rise, a shortage and a supplier error the agent confirms on the paper."] },
            { href: "/sesion?muestra=mes", img: "/muestras/mes/m09-carnes.jpg", es: ["Un mes de Casa Nela", "Doce albaranes en cuatro semanas. Pregunta «¿cuánto he pagado de más este mes?» y mira qué líneas se encienden."], en: ["A month at Casa Nela", "Twelve notes over four weeks. Ask \"how much have I overpaid this month?\" and see which lines light up."] },
          ].map((m) => (
            <Link key={m.href} href={m.href} className="group flex gap-4 rounded-2xl border border-linea bg-white/60 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.img} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover object-top" loading="lazy" />
              <div>
                <h2 className="font-semibold"><L es={m.es[0]} en={m.en[0]} /> <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span></h2>
                <p className="mt-1 text-sm leading-relaxed text-tinta-2"><L es={m.es[1]} en={m.en[1]} /></p>
                <p className="mt-2 text-xs text-apagado"><L es="Muestra grabada · datos ficticios" en="Recorded sample · fictional data" /></p>
              </div>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 border-t border-linea py-12 sm:grid-cols-3">
          {[
            { n: "1", es: ["Haz una foto", "Uno o varios albaranes encima de la mesa. SAM 3.1 separa cada papel y lo endereza."], en: ["Take a photo", "One or several notes on the counter. SAM 3.1 cuts out each paper and straightens it."] },
            { n: "2", es: ["Conforme lee y comprueba", "Muse Spark lee cada línea dos veces, por separado, y señala dónde está. El código comprueba cada euro, y un agente relee lo que no cuadra."], en: ["Conforme reads and checks", "Muse Spark reads every line twice, independently, and points to it. Code checks every euro, and an agent re-reads what doesn't add up."] },
            { n: "3", es: ["Reclama", "Toca cualquier euro y el papel se ilumina. La reclamación al proveedor sale escrita con las cifras del código."], en: ["Claim", "Tap any euro and the paper lights up. The claim to the supplier comes written, with the code's numbers."] },
          ].map((p) => (
            <div key={p.n} className="rounded-2xl border border-linea bg-white/60 p-6">
              <div className="font-serif text-3xl text-sello">{p.n}</div>
              <h2 className="mt-2 text-lg font-semibold"><L es={p.es[0]} en={p.en[0]} /></h2>
              <p className="mt-2 text-[15px] leading-relaxed text-tinta-2"><L es={p.es[1]} en={p.en[1]} /></p>
            </div>
          ))}
        </section>

        <section className="max-w-3xl border-t border-linea py-12">
          <p className="font-serif text-[clamp(1.3rem,2.6vw,1.8rem)] leading-snug">
            <L es="Mi madre lleva el papeleo del restaurante familiar en Gijón. La primera herramienta que hice para ella ha leído 715 albaranes desde marzo y ha encontrado 103 subidas de precio por 1.876 €."
              en="My mother does the paperwork at our family restaurant in Gijón. The first tool I built for her has read 715 delivery notes since March and caught 103 price rises worth €1,876." />
          </p>
          <p className="mt-3 text-sm text-apagado">Antonio González · <L es="cifras de Supplora, marzo-septiembre de 2026" en="figures from Supplora, March-September 2026" /></p>
        </section>

        <footer className="flex flex-col gap-2 border-t border-linea py-8 text-sm text-apagado sm:flex-row sm:items-center sm:justify-between">
          <span><L es="Hecho con Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe y Muse Image" en="Built with Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe and Muse Image" /></span>
          <span><L es="Nada de lo que subes se usa para entrenar modelos (modo estándar de la API)" en="Nothing you upload is used to train models (standard API mode)" /></span>
        </footer>
      </div>
    </main>
  );
}
