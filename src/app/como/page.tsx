import Link from "next/link";
import { BotonIdioma, L } from "@/components/Idioma";

type Texto = { es: string; en: string };
const t = (es: string, en: string): Texto => ({ es, en });

const PASOS: { quien: Texto; color: string; titulo: Texto; texto: Texto; agente?: boolean }[] = [
  { quien: t("SAM 3.1", "SAM 3.1"), color: "bg-sello", titulo: t("Separa y endereza", "Splits and straightens"), texto: t("Encuentra cada albarán de la foto con el concepto «sheet of paper» y da su máscara al píxel. El código calcula el rectángulo girado mínimo, endereza el papel y blanquea el fondo.", "Finds every note in the photo with the concept \"sheet of paper\" and returns its pixel mask. Code computes the minimum rotated rectangle, straightens the paper and whitens the background.") },
  { quien: t("Muse Spark 1.3", "Muse Spark 1.3"), color: "bg-tinta", titulo: t("Lee con cajas", "Reads with boxes"), texto: t("Copia cada línea tal como está impresa, con su caja en el papel (rejilla 0-1000), en un esquema JSON estricto. Dice cuánto hay que girar la página; el código la pone derecha y mueve las cajas con ella. Si la caja de una fila es imposible (sin altura, o fuera del orden impreso), el código la recoloca a partir de sus vecinas.", "Copies every line exactly as printed, with its box on the paper (0-1000 grid), in a strict JSON schema. It reports how far the page must turn; code turns it upright and moves the boxes with it. If a row's box is impossible (no height, or out of the printed order), code re-places it from its neighbours.") },
  { quien: t("Muse Spark 1.3", "Muse Spark 1.3"), color: "bg-tinta", titulo: t("Lee otra vez, por separado", "Reads again, independently"), texto: t("Una segunda lectura sobre la tabla ampliada, sin ver la primera: copia de nuevo cantidades, precios e importes y sitúa cada fila. Si las dos lecturas no coinciden en un número, es una duda.", "A second reading of the enlarged line table, without seeing the first: it copies quantities, prices and amounts again and places every row. If the two readings disagree on a number, that is a doubt.") },
  { quien: t("Código", "Code"), color: "bg-verde", titulo: t("Comprueba cada euro", "Checks every euro"), texto: t("Cantidad × precio, sumas por tipo de IVA, total, NIF, precio frente al historial, pedido y duplicados. Decide el sello: CONFORME, CON RESERVAS o REVISAR.", "Quantity × price, sums per VAT rate, total, tax ID, price against history, order and duplicates. It decides the stamp: ALL GOOD, CHECK BEFORE SIGNING or TAKE A LOOK.") },
  { quien: t("Muse Spark 1.3 + herramientas", "Muse Spark 1.3 + tools"), color: "bg-tinta", agente: true, titulo: t("Investiga lo que no cuadra", "Investigates what doesn't add up"), texto: t("Si hay dudas de lectura, un agente decide qué mirar en el papel y cierra con un veredicto que cita sus pruebas: celda mal leída, error del proveedor, lectura confirmada o «que lo mire una persona».", "When a reading is in doubt, an agent decides what to look at on the paper and closes with a verdict that cites its evidence: misread cell, supplier error, reading confirmed, or \"a person should look\".") },
  { quien: t("Muse Spark 1.3 + herramientas", "Muse Spark 1.3 + tools"), color: "bg-tinta", agente: true, titulo: t("Confirma cada reclamación en el papel", "Confirms every claim on the paper"), texto: t("Antes de pedirle dinero a un proveedor, el agente relee ampliada la línea reclamada y saca el registro con el que se compara (historial de precios o pedido). Si la relectura no coincide, la reclamación se retiene.", "Before any money is asked of a supplier, the agent re-reads the claimed line zoomed in and pulls the record it is compared against (price history or order). If the re-read disagrees, the claim is held back.") },
  { quien: t("Código", "Code"), color: "bg-verde", titulo: t("Escribe la reclamación", "Writes the claim"), texto: t("El mensaje, la frase para escribir en el albarán antes de firmar y la imagen de prueba (cada línea reclamada, cortada del papel del proveedor, con la cuenta) son plantillas con las cifras del código. No se envía nada sin ti.", "The message, the line to write on the note before signing, and the proof image (each claimed line cut from the supplier's own paper, with the arithmetic) are templates filled with code's numbers. Nothing is sent without you.") },
  { quien: t("Muse Voice Transcribe + Spark", "Muse Voice Transcribe + Spark"), color: "bg-sello", titulo: t("Entiende la pregunta", "Understands the question"), texto: t("La voz se pasa a texto; Spark la convierte en una intención con proveedores y productos sacados de tus propios albaranes. El código calcula la cifra y enciende las líneas que la forman.", "Speech becomes text; Spark turns it into an intent with suppliers and products taken from your own notes. Code computes the figure and lights up the lines behind it.") },
  { quien: t("Muse Image", "Muse Image"), color: "bg-rojo", titulo: t("Escenas de prueba", "Test scenes"), texto: t("Genera los fondos de las muestras (la encimera de la cocina). Siempre etiquetado; ningún albarán real aparece nunca.", "Generates the sample backgrounds (the kitchen counter). Always labelled; no real delivery note ever appears.") },
];

const HERRAMIENTAS: { nombre: string; hace: Texto; prueba: Texto }[] = [
  { nombre: "releer_celda", hace: t("Recorta una celda (desde el inicio de su fila), la amplía 2× y Spark la copia tal cual.", "Crops one cell (from the start of its row), zooms 2× and Spark copies it as printed."), prueba: t("el texto + el recorte", "the text + the crop") },
  { nombre: "releer_fila", hace: t("Recorta la fila entera, la amplía 2× y copia cantidad, precio, descuento, importe y cada número impreso en ella.", "Crops the whole row, zooms 2× and copies quantity, price, discount, amount and every number printed on it."), prueba: t("los números + el recorte", "the numbers + the crop") },
  { nombre: "releer_total", hace: t("Recorta el total o una fila de IVA y la vuelve a leer.", "Crops the total or one VAT row and reads it again."), prueba: t("el texto + el recorte", "the text + the crop") },
  { nombre: "historial_precio", hace: t("Últimas compras del producto (consulta del código).", "Last purchases of the product (a code lookup)."), prueba: t("fechas y precios", "dates and prices") },
  { nombre: "pedido", hace: t("Cantidad pedida del producto (consulta del código).", "Quantity ordered of the product (a code lookup)."), prueba: t("la línea del pedido", "the order line") },
  { nombre: "recontar_filas", hace: t("Vuelve a contar las filas de producto del papel.", "Counts the product rows on the paper again."), prueba: t("el recuento", "the count") },
];

const REGLAS: Texto[] = [
  t("Una celda corregida vale solo si una relectura ampliada muestra exactamente ese texto y la línea pasa a cuadrar.", "A corrected cell counts only if a zoomed re-read shows exactly that text and the line then adds up."),
  t("Un error del proveedor vale solo si una relectura confirma el importe impreso, ninguna relectura contradice la cantidad o el precio, y ningún otro número impreso en la fila hace cuadrar la cuenta (piezas frente a peso).", "A supplier error counts only if a re-read confirms the printed amount, no re-read contradicts the quantity or price, and no other number printed on the row makes the line add up (pieces against weight)."),
  t("Una subida o una falta se reclama solo si la relectura ampliada muestra el mismo precio y cantidad (subida) o la misma cantidad entregada (falta). Una relectura que no coincide retiene la reclamación, aunque el agente no la cite.", "A price rise or a shortage is claimed only if the zoomed re-read shows the same unit price and quantity (rise) or the same delivered quantity (shortage). A re-read that disagrees holds the claim back, even if the agent does not cite it."),
  t("Un cierre que cita una prueba que no existe se rechaza entero.", "A closing that cites evidence that does not exist is rejected as a whole."),
];

const LECCIONES: { titulo: Texto; texto: Texto }[] = [
  { titulo: t("Se inventó un precio que cuadraba.", "The model invented a price that added up."), texto: t("Leyó 1,175 € donde el papel dice 0,950 €, porque 24 × 1,175 son justo los 28,20 € cobrados. La segunda lectura, independiente, existe por esto.", "It read €1.175 where the paper says €0.950, because 24 × 1.175 is exactly the €28.20 charged. The second, independent reading exists because of this.") },
  { titulo: t("Casi acusa en falso a un proveedor.", "It nearly accused a supplier wrongly."), texto: t("Un albarán imprime piezas (3 U) y peso (11,081 kg); el agente tomó las piezas y vio un cobro de más de 111,52 €. Ahora el código prohíbe ese veredicto si otro número impreso en la fila hace cuadrar la línea.", "A note prints pieces (3 U) and weight (11.081 kg); the agent took the pieces and saw a €111.52 overcharge. Code now forbids that verdict when another number printed on the row makes the line add up.") },
  { titulo: t("Una caja sin altura escondió una fila entera.", "A box with no height hid a whole row."), texto: t("En una grabación, la primera lectura puso la caja de la cerveza encima de la fila 1 y sin altura; el recorte de la tabla dejó fuera esa fila y el agente miró en el sitio equivocado. Ahora el código recoloca las cajas imposibles a partir de sus vecinas, y una herramienta que no encuentra su línea vuelve a mirar en la tabla entera.", "On one recording, the first reading put the beer line's box above row 1 with zero height; the table crop cut that row out and the agent looked in the wrong place. Now code re-places impossible boxes from their neighbours, and a tool that cannot find its line looks again at the whole table.") },
  { titulo: t("Contar cajas con SAM no era fiable.", "Counting crates with SAM wasn't reliable."), texto: t("Acertó 5 de 23 recuentos en fotos públicas, así que no está en el producto.", "It was exact on 5 of 23 counts on public photos, so it is not in the product.") },
];

const LIMITES: Texto[] = [
  t("Medido en 33 albaranes reales de un solo restaurante familiar de Gijón. Otros países, albaranes a mano con precios y copias de calco no están medidos todavía.", "Measured on 33 real notes from one family restaurant in Gijón. Other countries, handwritten notes with prices and carbon copies are not measured yet."),
  t("El historial de precios y los pedidos de las muestras son ficticios. Una foto en vivo se comprueba en cuentas, IVA, totales y NIF; las subidas y las faltas necesitan tu historial y tus pedidos, que la app aún no importa.", "Price history and orders in the samples are fictional. A live photo is checked for arithmetic, VAT, totals and tax ID; price rises and shortages need your own history and orders, which the app does not import yet."),
  t("El agente tiene 4 llamadas a herramientas por albarán. Si las pruebas no son claras lo dice y el albarán pasa a ti; no adivina.", "The agent has 4 tool calls per note. When the evidence is unclear it says so and the note goes to you; it does not guess."),
  t("Las preguntas cubren un conjunto cerrado: pagado de más, subidas, gasto por proveedor o producto, último precio, albaranes con problemas e IVA.", "Questions cover a closed set: overpaid, price rises, spend by supplier or product, last price, notes with problems, and VAT."),
  t("La lectura usa Muse Spark por la Model API de Meta en modo estándar. Hay un modo privado con el modelo abierto Muse Glimmer 30B preparado tras una opción, pero aún sin medir.", "Reading uses Muse Spark through Meta's Model API in standard mode. A private mode on the open-weight Muse Glimmer 30B is wired behind a flag but not measured yet."),
  t("La muestra grabada de tres albaranes tardó 46 s y costó 0,106 $.", "The recorded run of three notes took 46 s and cost $0.106."),
];

function Bucle() {
  const nodo = "rounded-2xl border border-linea bg-white px-4 py-3 text-[15px] leading-snug";
  const flecha = <span aria-hidden className="flex items-center justify-center text-apagado">↓</span>;
  return (
    <figure className="mt-8 rounded-3xl border border-linea bg-papel-2/50 p-4 sm:p-6" aria-labelledby="bucle-pie">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-3">
        <div className={nodo}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-verde"><L es="Código" en="Code" /></p>
          <L es="Encuentra una duda o una reclamación y le pasa al agente lo impreso y sus cálculos." en="Finds a doubt or a claim and hands the agent what is printed and its own figures." />
        </div>
        <span aria-hidden className="hidden items-center text-apagado sm:flex">→</span>
        <span className="sm:hidden">{flecha}</span>
        <div className={`${nodo} border-tinta/30`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinta">Muse Spark 1.3</p>
          <L es="Elige la herramienta más barata que pueda decidir." en="Picks the cheapest tool that could settle it." />
        </div>
      </div>
      <div className="my-2 grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
        <span />
        <span />
        <div className="flex items-center justify-center gap-2 text-xs text-apagado">
          <span aria-hidden>↓↑</span><L es="hasta 4 veces" en="up to 4 times" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-3">
        <div className={`${nodo} order-3 sm:order-1`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-verde"><L es="Código" en="Code" /></p>
          <L es="Comprueba cada prueba citada con sus reglas. Acepta el veredicto, o lo rechaza y el albarán pasa a una persona." en="Checks every cited piece of evidence against its rules. Accepts the verdict, or rejects it and the note goes to a person." />
        </div>
        <span aria-hidden className="order-2 hidden items-center text-apagado sm:flex">←</span>
        <span className="order-2 sm:hidden">{flecha}</span>
        <div className={`${nodo} order-1 sm:order-3`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-verde"><L es="Código ejecuta la herramienta" en="Code runs the tool" /></p>
          <L es="Recorta y amplía el papel, o consulta el historial o el pedido. Cada resultado es una prueba numerada (ev1, ev2…) con su recorte." en="Crops and zooms the paper, or looks up the history or the order. Every result is numbered evidence (ev1, ev2…) with its crop." />
        </div>
      </div>
      <figcaption id="bucle-pie" className="mt-4 text-sm text-tinta-2">
        <L es="Al final el agente cierra citando las pruebas que lo sostienen. Nunca pone una cifra: las cuentas son del código." en="At the end the agent closes, citing the evidence that supports it. It never sets a figure: the arithmetic belongs to code." />
      </figcaption>
    </figure>
  );
}

export default function Page() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[900px] px-4 pb-24 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/sesion?muestra=encimera" prefetch={false} className="hidden min-h-[40px] items-center rounded-full px-3 text-tinta-2 hover:text-tinta sm:inline-flex"><L es="Ver una muestra" en="See a sample" /></Link>
            <Link href="/eval" className="hidden min-h-[40px] items-center rounded-full px-3 text-tinta-2 hover:text-tinta sm:inline-flex"><L es="Cómo lo medimos" en="How we measure" /></Link>
            <BotonIdioma />
          </nav>
        </header>

        <p className="mt-6 text-sm uppercase tracking-[0.14em] text-apagado"><L es="Cómo funciona" en="How it works" /></p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-[1.08] tracking-tight">
          <L es="El modelo lee y señala. Un agente vuelve al papel. El código pone los números." en="The model reads and points. An agent goes back to the paper. Code owns the numbers." />
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-tinta-2">
          <L es="Cada euro de la pantalla sale del código y señala su sitio en el papel. Los modelos leen, localizan, eligen qué mirar y entienden la pregunta. Nada de lo que dicen se convierte en una cifra o en una reclamación hasta que el código lo ha comprobado."
            en="Every euro on screen comes from code and points to its place on the paper. The models read, locate, choose what to look at and understand the question. Nothing they say becomes a figure or a claim until code has checked it." />
        </p>

        <h2 className="mt-14 font-serif text-2xl font-semibold"><L es="De la foto a la reclamación" en="From photo to claim" /></h2>
        <ol className="relative mt-6 flex flex-col gap-3 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-0.5 before:bg-linea">
          {PASOS.map((p, i) => (
            <li key={i} className="relative flex gap-4">
              <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif text-lg text-papel ${p.color}`}>{i + 1}</span>
              <div className={`flex-1 rounded-2xl border p-4 ${p.agente ? "border-tinta/30 bg-white" : "border-linea bg-white/70"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-apagado">
                  <L es={p.quien.es} en={p.quien.en} />
                  {p.agente && <span className="rounded-full bg-tinta px-2 py-0.5 text-[10px] tracking-[0.1em] text-papel"><L es="agente" en="agent" /></span>}
                </div>
                <h3 className="mt-1 text-lg font-semibold"><L es={p.titulo.es} en={p.titulo.en} /></h3>
                <p className="mt-1 text-[15px] leading-relaxed text-tinta-2"><L es={p.texto.es} en={p.texto.en} /></p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-16" aria-labelledby="bucle">
          <h2 id="bucle" className="font-serif text-2xl font-semibold"><L es="El bucle del agente" en="The agent loop" /></h2>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-tinta-2">
            <L es="Muse Spark 1.3 por la Responses API, con herramientas que ejecuta el código. La API solo admite tool_choice «auto», así que al llegar al límite solo se le ofrece la herramienta de cerrar. Tope: 4 llamadas y 45 s por albarán (40 s para la reclamación)."
              en="Muse Spark 1.3 through the Responses API, with tools that code runs. The API only allows tool_choice “auto”, so at the limit the agent is offered only the closing tool. Budget: 4 calls and 45 s per note (40 s for the claim file)." />
          </p>
          <Bucle />

          <h3 className="mt-10 text-lg font-semibold"><L es="Sus herramientas" en="Its tools" /></h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-linea bg-white/70">
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only"><L es="Herramientas del agente" en="The agent's tools" /></caption>
              <thead className="bg-papel-2/60 text-xs uppercase tracking-[0.1em] text-apagado">
                <tr><th scope="col" className="px-4 py-2 font-semibold"><L es="Herramienta" en="Tool" /></th><th scope="col" className="px-4 py-2 font-semibold"><L es="Qué hace el código" en="What code does" /></th><th scope="col" className="hidden px-4 py-2 font-semibold sm:table-cell"><L es="Prueba" en="Evidence" /></th></tr>
              </thead>
              <tbody>
                {HERRAMIENTAS.map((h) => (
                  <tr key={h.nombre} className="border-t border-linea align-top">
                    <th scope="row" className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-medium text-tinta">{h.nombre}</th>
                    <td className="px-4 py-3 leading-relaxed text-tinta-2"><L es={h.hace.es} en={h.hace.en} /><span className="mt-1 block text-xs text-apagado sm:hidden"><L es={h.prueba.es} en={h.prueba.en} /></span></td>
                    <td className="hidden px-4 py-3 text-tinta-2 sm:table-cell"><L es={h.prueba.es} en={h.prueba.en} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-tinta-2"><L es="Si la línea no está en su recorte, la herramienta vuelve a mirar una vez en la tabla entera, y la prueba lo dice." en="If the line is not in its crop, the tool looks once more at the whole table, and the evidence says so." /></p>

          <h3 className="mt-10 text-lg font-semibold"><L es="Lo que el código acepta como prueba" en="What code accepts as evidence" /></h3>
          <ul className="mt-3 flex flex-col gap-3">
            {REGLAS.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-2xl border border-linea bg-white/70 p-4 text-[15px] leading-relaxed text-tinta">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-verde/10 font-serif text-sm text-verde" aria-hidden>{i + 1}</span>
                <L es={r.es} en={r.en} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link href="/sesion?muestra=encimera" prefetch={false} className="font-medium underline decoration-rotulador decoration-4 underline-offset-4"><L es="Ver la traza real de cada reclamación" en="See the real trace behind each claim" /></Link>
          </p>
        </section>

        <section className="mt-16" aria-labelledby="lecciones">
          <h2 id="lecciones" className="font-serif text-2xl font-semibold"><L es="Lo que aprendí haciéndolo" en="What I learned building it" /></h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {LECCIONES.map((l, i) => (
              <article key={i} className="rounded-2xl border border-linea bg-white/70 p-5">
                <h3 className="font-semibold leading-snug"><L es={l.titulo.es} en={l.titulo.en} /></h3>
                <p className="mt-2 text-[15px] leading-relaxed text-tinta-2"><L es={l.texto.es} en={l.texto.en} /></p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="limites">
          <h2 id="limites" className="font-serif text-2xl font-semibold"><L es="Límites, con honestidad" en="Honest limits" /></h2>
          <ul className="mt-5 flex flex-col divide-y divide-linea rounded-2xl border border-linea bg-white/70">
            {LIMITES.map((l, i) => (
              <li key={i} className="px-5 py-4 text-[15px] leading-relaxed text-tinta-2"><L es={l.es} en={l.en} /></li>
            ))}
          </ul>
        </section>

        <section className="mt-16 rounded-2xl border border-linea bg-white/70 p-5">
          <h2 className="font-serif text-xl font-semibold"><L es="Lo que el modelo nunca decide" en="What the model never decides" /></h2>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta-2">
            <L es="Ninguna cifra (sumas, diferencias, € en juego, respuestas), si una línea está bien, el precio de referencia, si un albarán está duplicado, las conversiones de unidades, qué líneas se encienden, el sello ni el texto que recibe un proveedor. Solo modo estándar de la API: una lista blanca en el código rechaza cualquier modelo «-contributor»."
              en="No figure (sums, differences, € at stake, answers), whether a line is right, the reference price, whether a note is a duplicate, unit conversions, which lines light up, the stamp, or the text a supplier receives. Standard API mode only: an allowlist in code refuses any “-contributor” model." />
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/eval" className="font-medium underline decoration-rotulador decoration-4 underline-offset-4"><L es="Ver cómo lo medimos" en="See how we measure it" /></Link>
            <a href="https://github.com/antonmareo10/conforme" className="font-medium underline decoration-linea decoration-2 underline-offset-4"><L es="El código, en GitHub" en="The code, on GitHub" /></a>
          </p>
        </section>
      </div>
    </main>
  );
}
