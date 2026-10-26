import Link from "next/link";
import { BotonIdioma, L } from "@/components/Idioma";

const PASOS: { quien: string; color: string; es: [string, string]; en: [string, string] }[] = [
  { quien: "SAM 3.1", color: "bg-sello", es: ["Separa y endereza", "Encuentra cada albarán de la foto con el concepto «sheet of paper» y da su máscara al píxel. El código calcula el rectángulo girado mínimo, endereza el papel y blanquea el fondo."], en: ["Splits and straightens", "Finds every note in the photo with the concept \"sheet of paper\" and returns its pixel mask. Code computes the minimum rotated rectangle, straightens the paper and whitens the background."] },
  { quien: "Muse Spark 1.3", color: "bg-tinta", es: ["Lee con cajas", "Copia cada línea tal como está impresa, con su caja en el papel (rejilla 0-1000), en un esquema JSON estricto. Dice cuánto hay que girar la página; el código la pone derecha y mueve todas las cajas con ella."], en: ["Reads with boxes", "Copies every line exactly as printed, with its box on the paper (0-1000 grid), in a strict JSON schema. It reports how far the page must turn; code turns it upright and moves every box with it."] },
  { quien: "Muse Spark 1.3", color: "bg-tinta", es: ["Lee otra vez, por separado", "Una segunda lectura sobre la tabla ampliada, sin ver la primera: copia de nuevo cantidades, precios e importes y sitúa cada fila. Si las dos lecturas no coinciden en un número, es una duda."], en: ["Reads again, independently", "A second reading of the enlarged line table, without seeing the first: it copies quantities, prices and amounts again and places every row. If the two readings disagree on a number, that is a doubt."] },
  { quien: "Código", color: "bg-verde", es: ["Comprueba cada euro", "Cantidad × precio, sumas por tipo de IVA, total, NIF, precio frente al historial, pedido, duplicados. Decide el sello: CONFORME, CON RESERVAS o REVISAR."], en: ["Checks every euro", "Quantity × price, sums per VAT rate, total, tax ID, price against history, order, duplicates. It decides the stamp: ALL GOOD, CHECK BEFORE SIGNING or TAKE A LOOK."] },
  { quien: "Muse Spark 1.3 + herramientas", color: "bg-tinta", es: ["Investiga lo que no cuadra", "Un agente decide qué mirar: releer una celda o una fila ampliadas, el total, el historial de precios, el pedido o recontar filas. Hasta 4 pasos. Cada resultado es una evidencia numerada con su recorte."], en: ["Investigates what doesn't add up", "An agent decides what to look at: re-read a zoomed cell or row, the total, the price history, the order, or recount rows. Up to 4 steps. Every result is numbered evidence with its crop."] },
  { quien: "Código", color: "bg-verde", es: ["Valida el veredicto", "Una corrección solo vale si una relectura muestra ese texto y la línea cuadra. Un error del proveedor solo vale si el importe se confirma en el papel y ningún otro número impreso en la fila explica la cuenta."], en: ["Validates the verdict", "A correction counts only if a re-read shows that text and the line then adds up. A supplier error counts only if the amount is confirmed on the paper and no other number printed on the row explains it."] },
  { quien: "Muse Voice Transcribe + Spark", color: "bg-sello", es: ["Entiende la pregunta", "La voz se pasa a texto; Spark la convierte en una intención con proveedores y productos sacados de tus propios albaranes. El código calcula la cifra y enciende las líneas que la forman."], en: ["Understands the question", "Speech becomes text; Spark turns it into an intent with suppliers and products taken from your own notes. Code computes the figure and lights up the lines behind it."] },
  { quien: "Muse Image", color: "bg-rojo", es: ["Escenas de prueba", "Genera los fondos de las muestras (la encimera de la cocina). Siempre etiquetado; ningún albarán real aparece nunca."], en: ["Test scenes", "Generates the sample backgrounds (the kitchen counter). Always labelled; no real delivery note ever appears."] },
];

export default function Page() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[900px] px-4 pb-24 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
          <BotonIdioma />
        </header>
        <p className="mt-6 text-sm uppercase tracking-[0.14em] text-apagado"><L es="Cómo funciona" en="How it works" /></p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-tight">
          <L es="El modelo lee y señala. El código pone los números." en="The model reads and points. Code owns the numbers." />
        </h1>
        <ol className="relative mt-10 flex flex-col gap-4 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-0.5 before:bg-linea">
          {PASOS.map((p, i) => (
            <li key={i} className="relative flex gap-4">
              <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-lg text-papel ${p.color}`}>{i + 1}</span>
              <div className="flex-1 rounded-2xl border border-linea bg-white/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-apagado"><L es={p.quien} en={p.quien.replace("Código", "Code").replace("herramientas", "tools")} /></div>
                <h2 className="mt-1 text-lg font-semibold"><L es={p.es[0]} en={p.en[0]} /></h2>
                <p className="mt-1 text-[15px] leading-relaxed text-tinta-2"><L es={p.es[1]} en={p.en[1]} /></p>
              </div>
            </li>
          ))}
        </ol>
        <section className="mt-12 rounded-2xl border border-linea bg-white/70 p-5">
          <h2 className="font-serif text-xl font-semibold"><L es="Lo que el modelo nunca decide" en="What the model never decides" /></h2>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta-2">
            <L es="Ninguna cifra (sumas, diferencias, € en juego, respuestas), si una línea está bien, el precio de referencia, si un albarán está duplicado, las conversiones de unidades, qué líneas se encienden ni el sello. Solo modo estándar de la API: una lista blanca en el código rechaza cualquier modelo «-contributor»."
              en="No figure (sums, differences, € at stake, answers), whether a line is right, the reference price, whether a note is a duplicate, unit conversions, which lines light up, or the stamp. Standard API mode only: an allowlist in code refuses any “-contributor” model." />
          </p>
          <p className="mt-3 text-sm">
            <Link href="/eval" className="font-medium underline decoration-rotulador decoration-4 underline-offset-4"><L es="Ver cómo lo medimos" en="See how we measure it" /></Link>
          </p>
        </section>
      </div>
    </main>
  );
}
