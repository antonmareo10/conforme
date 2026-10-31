import Link from "next/link";
import { BotonIdioma, L } from "@/components/Idioma";
import { HeroDemo } from "@/components/HeroDemo";
import { HERO_SIZES, HERO_SRCSET } from "@/lib/hero";
import { CasoDeMuestraPerezoso } from "@/components/CasoDeMuestraPerezoso";
import { pruebaReal } from "@/lib/prueba";

export default function Home() {
  const prueba = pruebaReal();
  return (
    <main className="flex-1">
      <link rel="preload" as="image" href="/muestras/encimera/escena-1200.webp" imageSrcSet={HERO_SRCSET} imageSizes={HERO_SIZES} type="image/webp" fetchPriority="high" />
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
              <L es="Una foto de los albaranes de la mañana. Conforme lee cada línea y comprueba cada euro. Si algo no cuadra, un agente vuelve al papel a confirmarlo y te deja escrita la reclamación, con la prueba adjunta."
                en="One photo of the morning's delivery notes. Conforme reads every line and checks every euro. When something is off, an agent goes back to the paper to confirm it, then writes the claim with the proof attached." />
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
                <L es={`${prueba.pctCentimo.toLocaleString("es-ES")} % de líneas al céntimo${prueba.pasadas > 1 ? ` (media de ${prueba.pasadas} pasadas)` : ""}`} en={`${prueba.pctCentimo}% of lines to the cent${prueba.pasadas > 1 ? ` (mean of ${prueba.pasadas} runs)` : ""}`} />
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

        <section className="grid grid-cols-1 items-start gap-8 border-t border-linea py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12" aria-labelledby="agente">
          <div className="lg:sticky lg:top-8">
            <p className="text-sm uppercase tracking-[0.14em] text-apagado"><L es="Lo que te deja el agente" en="What the agent hands you" /></p>
            <h2 id="agente" className="mt-3 font-serif text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-[1.1] tracking-tight">
              <L es="Antes de pedirle un céntimo a un proveedor, vuelve a mirar el papel." en="Before it asks a supplier for a cent, it checks the paper again." />
            </h2>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-tinta-2">
              <L es="El código encuentra lo que no cuadra. Después un agente decide qué mirar: amplía esa línea y la vuelve a leer, saca el historial de precios o el pedido, y cierra el caso citando lo que vio. El código comprueba cada prueba que cita. Si la segunda mirada no coincide con la primera, la reclamación se retiene y el albarán pasa a ti."
                en="Code finds what doesn't add up. Then an agent decides what to look at: it zooms into that line and reads it again, pulls the price history or the order, and closes the case citing what it saw. Code checks every piece of evidence it cites. If the second look disagrees with the first, the claim is held back and the note goes to you." />
            </p>
            <ul className="mt-6 flex max-w-xl flex-col gap-3 text-[15px] leading-relaxed text-tinta">
              {[
                { es: "La prueba es su propio papel: la línea reclamada, cortada del albarán del proveedor, con la cuenta al lado.", en: "The proof is their own paper: the claimed line cut from the supplier's note, with the sum next to it." },
                { es: "Una frase para escribir en el albarán antes de firmar, mientras espera el repartidor.", en: "One line to write on the note before you sign, while the driver waits." },
                { es: "El mensaje queda listo para WhatsApp o correo. Tú decides si se envía.", en: "The message is ready for WhatsApp or email. You decide whether to send it." },
              ].map((b, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-verde/10 text-verde" aria-hidden>
                    <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <L es={b.es} en={b.en} />
                </li>
              ))}
            </ul>
            <Link href="/sesion?muestra=encimera" className="group mt-7 inline-flex min-h-[44px] items-center gap-2 font-medium underline decoration-rotulador decoration-4 underline-offset-4">
              <L es="Verlo trabajar con tres albaranes" en="Watch it work on three notes" />
              <span aria-hidden className="transition group-hover:translate-x-1">→</span>
            </Link>
          </div>
          <CasoDeMuestraPerezoso />
        </section>

        <section className="grid grid-cols-1 gap-4 border-t border-linea py-10 sm:grid-cols-2 lg:grid-cols-3" aria-label="Muestras">
          {[
            { href: "/sesion?muestra=encimera", img: "/muestras/encimera/escena-320.webp", es: ["Tres albaranes en la encimera", "Una foto, tres proveedores: una subida, una falta y un error del proveedor. El agente confirma las tres en el papel y prepara tres reclamaciones."], en: ["Three notes on the counter", "One photo, three suppliers: a price rise, a shortage and a supplier error. The agent confirms all three on the paper and prepares three claims."] },
            { href: "/sesion?muestra=girado", img: "/muestras/girado/carnes-girado-320.webp", es: ["Girado y tenue", "Un albarán de matricial escaneado de lado y descolorido. Muse Spark lo pone derecho y lo lee dos veces, y el agente confirma en el papel un error de 3,00 €."], en: ["Rotated and faint", "A dot-matrix note scanned sideways and faded. Muse Spark turns it upright and reads it twice, and the agent confirms a €3.00 mistake on the paper."] },
            { href: "/sesion?muestra=mes", img: "/muestras/mes/m09-carnes-320.webp", es: ["Un mes de Casa Nela", "Doce albaranes en cuatro semanas. Pregunta «¿cuánto he pagado de más este mes?» y mira qué líneas se encienden."], en: ["A month at Casa Nela", "Twelve notes over four weeks. Ask \"how much have I overpaid this month?\" and see which lines light up."] },
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
          <p className="text-sm text-tinta-2 sm:col-span-2 lg:col-span-3">
            <Link href="/sesion?muestra=encimera&modelo=abierto" className="group inline-flex min-h-[44px] items-center gap-2 font-medium text-tinta underline decoration-rotulador decoration-4 underline-offset-4">
              <L es="La misma encimera, leída por Muse Spark Open" en="The same counter, read by Muse Spark Open" /> <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span>
            </Link>
            <span className="ml-2"><L es="Pesos abiertos de Meta en Baseten: mismo flujo, mismas comprobaciones del código." en="Meta's open weights on Baseten: same pipeline, same code checks." /></span>
          </p>
        </section>

        <section className="grid gap-6 border-t border-linea py-12 sm:grid-cols-3">
          {[
            { n: "1", es: ["Haz una foto", "Uno o varios albaranes encima de la mesa. SAM 3.1 separa cada papel y lo endereza."], en: ["Take a photo", "One or several notes on the counter. SAM 3.1 cuts out each paper and straightens it."] },
            { n: "2", es: ["Conforme lee y comprueba", "Muse Spark lee cada línea dos veces, por separado, y señala dónde está. El código comprueba cada euro. Toca cualquier euro y el papel se ilumina."], en: ["Conforme reads and checks", "Muse Spark reads every line twice, independently, and points to it. Code checks every euro. Tap any euro and the paper lights up."] },
            { n: "3", es: ["El agente prepara la reclamación", "Confirma cada problema en el papel y escribe la reclamación con la prueba adjunta. No se envía nada sin ti."], en: ["The agent builds the claim", "It confirms each problem on the paper, then writes the claim with the proof attached. Nothing is sent without you."] },
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
          <span><L es="Hecho con Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe y Muse Image; modo privado con Muse Spark Open" en="Built with Muse Spark 1.3, SAM 3.1, Muse Voice Transcribe and Muse Image; private mode on Muse Spark Open" /></span>
          <span><L es="Nada de lo que subes se usa para entrenar modelos (modo estándar de la API)" en="Nothing you upload is used to train models (standard API mode)" /></span>
        </footer>
      </div>
    </main>
  );
}
