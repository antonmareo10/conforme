import Link from "next/link";
import { BotonIdioma, L } from "@/components/Idioma";
import ultimo from "../../../eval/results/real-R-latest.json";
import v1 from "../../../eval/results/real-R-2026-10-26-low-2048.json";
import v1inv from "../../../eval/results/real-R-2026-10-26-low-2048-investigar.json";
import v2sin from "../../../eval/results/real-R-2026-10-26-v2-sin-enderezar.json";

type R = { n: number; de: number; pct: number | null };
type Agg = {
  fecha: string;
  albaranes: number;
  lineas_al_centimo: R;
  lineas_completas: R;
  albaranes_perfectos: R;
  ok_silencioso: number;
  sellos: { CONFORME: number; CON_RESERVAS: number; REVISAR: number };
  revision_justificada: number;
  revision_innecesaria: number;
  cabecera: Record<"proveedor" | "numero" | "fecha" | "total", R>;
  por_dificultad: Record<string, { albaranes: number; lineas_al_centimo: R; albaranes_perfectos: R; ok_silencioso: number }>;
  tiempo_ms: { p50: number; p95: number };
  coste_usd: { total: number; por_albaran: number };
};
const a = ultimo as unknown as Agg;
const pct = (r: R, l: "es" | "en") => (r.pct == null ? "–" : l === "es" ? `${r.pct.toLocaleString("es-ES")} %` : `${r.pct}%`);
const fecha = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

const DIF: Record<string, [string, string]> = {
  girado: ["Escaneados de lado (90°)", "Scanned sideways (90°)"],
  matricial_tenue: ["Impresora matricial tenue", "Faded dot-matrix print"],
  borroso: ["Borrosos o con reflejos", "Blurry or with glare"],
  dos_tipos_iva: ["Dos tipos de IVA en el mismo papel", "Two VAT rates on one page"],
};

function Fila({ es, en, valor, nota }: { es: string; en: string; valor: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <tr className="border-b border-linea">
      <th scope="row" className="py-3 pr-4 text-left font-normal text-tinta-2"><L es={es} en={en} />{nota && <div className="text-xs text-apagado">{nota}</div>}</th>
      <td className="cifras py-3 text-right font-medium">{valor}</td>
    </tr>
  );
}

export default function Page() {
  if (!a) return null;
  const versiones: { es: string; en: string; r: Agg }[] = [
    { es: "Una lectura + comprobaciones en código", en: "One reading + code checks", r: v1 as unknown as Agg },
    { es: "+ agente investigador", en: "+ investigator agent", r: v1inv as unknown as Agg },
    { es: "+ segunda lectura independiente", en: "+ second, independent reading", r: v2sin as unknown as Agg },
    { es: "+ papel enderezado antes de la segunda lectura (actual)", en: "+ page turned upright before the second reading (current)", r: a },
  ];
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-[960px] px-4 pb-24 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">Conforme</Link>
          <BotonIdioma />
        </header>

        <section className="py-8">
          <p className="text-sm uppercase tracking-[0.14em] text-apagado"><L es="Cómo lo medimos" en="How we measure" /></p>
          <h1 className="mt-3 font-serif text-[clamp(2.4rem,6vw,4.2rem)] font-semibold leading-none text-tinta">
            <L es={`${pct(a.lineas_al_centimo, "es")} de líneas al céntimo`} en={`${pct(a.lineas_al_centimo, "en")} of lines to the cent`} />
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-tinta-2">
            <L es={`${a.lineas_al_centimo.n} de ${a.lineas_al_centimo.de} líneas con importe impreso, en ${a.albaranes} albaranes reales de un restaurante familiar de Gijón (${a.por_dificultad.girado?.albaranes ?? 0} escaneados de lado). ${a.ok_silencioso} OK silenciosos: ningún albarán con un error salió sellado como CONFORME. Medido el ${fecha(a.fecha)}.`}
              en={`${a.lineas_al_centimo.n} of ${a.lineas_al_centimo.de} lines with a printed amount, on ${a.albaranes} real delivery notes from a family restaurant in Gijón (${a.por_dificultad.girado?.albaranes ?? 0} of them scanned sideways). ${a.ok_silencioso} silent OKs: no note with an error was stamped ALL GOOD. Measured on ${fecha(a.fecha)}.`} />
          </p>
        </section>

        <section className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-linea bg-white/70 p-5">
            <h2 className="font-serif text-xl font-semibold"><L es="Resultados" en="Results" /></h2>
            <table className="mt-3 w-full text-[15px]">
              <tbody>
                <Fila es="Líneas al céntimo" en="Lines to the cent" valor={<><L es={pct(a.lineas_al_centimo, "es")} en={pct(a.lineas_al_centimo, "en")} /> <span className="text-apagado">({a.lineas_al_centimo.n}/{a.lineas_al_centimo.de})</span></>} />
                <Fila es="Líneas completas (cantidad, precio, importe e IVA)" en="Complete lines (quantity, price, amount and VAT)" valor={<><L es={pct(a.lineas_completas, "es")} en={pct(a.lineas_completas, "en")} /> <span className="text-apagado">({a.lineas_completas.n}/{a.lineas_completas.de})</span></>} />
                <Fila es="Albaranes perfectos" en="Perfect notes" valor={<>{a.albaranes_perfectos.n}/{a.albaranes_perfectos.de}</>} />
                <Fila es="OK silenciosos" en="Silent OKs" valor={<span className="text-verde">{a.ok_silencioso}</span>} nota={<L es="Sello CONFORME con algún error. Se publica siempre." en="ALL GOOD stamp on a note with an error. Always published." />} />
                <Fila es="Enviados a revisión, con razón" en="Sent to review, rightly" valor={a.revision_justificada} />
                <Fila es="Enviados a revisión sin necesidad" en="Sent to review needlessly" valor={a.revision_innecesaria} />
                <Fila es="Total del albarán exacto" en="Note total exact" valor={<>{a.cabecera.total.n}/{a.cabecera.total.de}</>} />
                <Fila es="Fecha / número / proveedor" en="Date / number / supplier" valor={<>{a.cabecera.fecha.pct} · {a.cabecera.numero.pct} · {a.cabecera.proveedor.pct} %</>} />
                <Fila es="Tiempo por albarán (mediana / p95)" en="Time per note (median / p95)" valor={<>{(a.tiempo_ms.p50 / 1000).toFixed(1)} / {(a.tiempo_ms.p95 / 1000).toFixed(1)} s</>} />
                <Fila es="Coste por albarán" en="Cost per note" valor={<>{a.coste_usd.por_albaran.toFixed(3)} $</>} />
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl border border-linea bg-white/70 p-5">
            <h2 className="font-serif text-xl font-semibold"><L es="Por dificultad" en="By difficulty" /></h2>
            <table className="mt-3 w-full text-[15px]">
              <tbody>
                {Object.entries(a.por_dificultad).map(([k, d]) => (
                  <Fila key={k} es={`${DIF[k]?.[0] ?? k} (${d.albaranes})`} en={`${DIF[k]?.[1] ?? k} (${d.albaranes})`}
                    valor={<>{d.lineas_al_centimo.pct} % · {d.albaranes_perfectos.n}/{d.albaranes_perfectos.de}</>} nota={<L es="líneas al céntimo · albaranes perfectos" en="lines to the cent · perfect notes" />} />
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm text-tinta-2">
              <L es={`Sellos: ${a.sellos.CONFORME} CONFORME, ${a.sellos.REVISAR} REVISAR. Todos los CONFORME estaban bien leídos. Los REVISAR son un ticket borroso con reflejo, una matricial casi borrada y un cargo sin explicar en el papel.`}
                en={`Stamps: ${a.sellos.CONFORME} ALL GOOD, ${a.sellos.REVISAR} TAKE A LOOK. Every ALL GOOD note was read right. The TAKE A LOOK ones are a blurry ticket with glare, an almost erased dot-matrix print and an unexplained charge on the paper.`} />
            </p>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-linea bg-white/70 p-5">
          <h2 className="font-serif text-xl font-semibold"><L es="Cómo llegamos aquí (mismos 33 albaranes)" en="How we got here (same 33 notes)" /></h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[15px]">
              <thead>
                <tr className="border-b border-linea text-left text-xs uppercase tracking-wider text-apagado">
                  <th className="py-2 font-medium"><L es="Versión" en="Version" /></th>
                  <th className="py-2 text-right font-medium"><L es="Al céntimo" en="To the cent" /></th>
                  <th className="py-2 text-right font-medium"><L es="Perfectos" en="Perfect" /></th>
                  <th className="py-2 text-right font-medium"><L es="Revisión innecesaria" en="Needless review" /></th>
                  <th className="py-2 text-right font-medium"><L es="OK silenciosos" en="Silent OKs" /></th>
                </tr>
              </thead>
              <tbody>
                {versiones.map((v) => (
                  <tr key={v.en} className="cifras border-b border-linea">
                    <td className="py-3 pr-4 text-tinta-2"><L es={v.es} en={v.en} /></td>
                    <td className="py-3 text-right">{v.r.lineas_al_centimo.pct} %</td>
                    <td className="py-3 text-right">{v.r.albaranes_perfectos.n}/{v.r.albaranes_perfectos.de}</td>
                    <td className="py-3 text-right">{v.r.revision_innecesaria}</td>
                    <td className="py-3 text-right">{v.r.ok_silencioso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              es: ["Se inventó un precio que cuadraba", "Al leer un albarán de prueba, el modelo escribió 1,175 € donde el papel dice 0,950 €: 24 × 1,175 son justo los 28,20 € cobrados. Un error de 5,40 € habría salido como CONFORME. Desde entonces una segunda lectura independiente copia otra vez cada número sin ver la primera, y cualquier diferencia se mira con zoom."],
              en: ["It invented a price that added up", "Reading a test note, the model wrote €1.175 where the paper says €0.950: 24 × 1.175 is exactly the €28.20 charged. A €5.40 overcharge would have been stamped ALL GOOD. Since then a second, independent reading copies every number again without seeing the first, and any difference gets a zoomed look."],
            },
            {
              es: ["Casi acusa a un proveedor sin razón", "Un albarán real imprime piezas (3 U) y peso (11,081 kg). El agente tomó las piezas y concluyó que el proveedor cobraba 111,52 € de más. Ahora el código prohíbe ese veredicto si otro número impreso en la fila hace cuadrar la línea."],
              en: ["It nearly accused a supplier wrongly", "A real note prints pieces (3 U) and weight (11.081 kg). The agent took the pieces and concluded the supplier overcharged €111.52. Now code forbids that verdict if another number printed on the row makes the line add up."],
            },
            {
              es: ["Contar cajas con SAM no da la talla", "Probamos SAM 3.1 para contar la mercancía en 21 fotos públicas de cajas: acertó exacto 5 de 23 recuentos. No es fiable para firmar un albarán, así que no está en el producto."],
              en: ["Counting crates with SAM isn't good enough", "We tried SAM 3.1 to count goods on 21 public photos of crates: exact on 5 of 23 counts. Not reliable enough to sign a delivery note, so it's not in the product."],
            },
          ].map((x) => (
            <article key={x.en[0]} className="rounded-2xl border border-linea bg-white/70 p-5">
              <h3 className="font-semibold"><L es={x.es[0]} en={x.en[0]} /></h3>
              <p className="mt-2 text-[15px] leading-relaxed text-tinta-2"><L es={x.es[1]} en={x.en[1]} /></p>
            </article>
          ))}
        </section>

        <section className="mt-10 max-w-3xl text-[15px] leading-relaxed text-tinta-2">
          <h2 className="font-serif text-xl font-semibold text-tinta"><L es="Método" en="Method" /></h2>
          <p className="mt-3">
            <L es="Cada albarán pasa por el producto tal cual: lectura con Muse Spark 1.3 (esfuerzo bajo, 2048 px), papel enderezado, segunda lectura independiente de la tabla, comprobaciones en código y agente investigador cuando hay dudas. Las líneas leídas se emparejan con la verdad por asignación óptima (descripción y, de apoyo, el importe). «Al céntimo» = el importe de la línea coincide exactamente en céntimos; «completa» = además cantidad, precio e IVA exactos."
              en="Each note goes through the product as is: reading with Muse Spark 1.3 (low effort, 2048 px), page turned upright, second independent reading of the line table, code checks and the investigator agent when there are doubts. Read lines are matched to the truth by optimal assignment (description, with the amount as support). 'To the cent' = the line amount matches exactly in cents; 'complete' = quantity, price and VAT exact as well." />
          </p>
          <p className="mt-3">
            <L es="Privacidad: los albaranes reales son de un restaurante familiar que nos dejó usarlos solo para medir. No salen del ordenador de Antón ni aparecen aquí; en el repositorio solo hay cifras agregadas, y un filtro bloquea cualquier commit con datos reales."
              en="Privacy: the real notes belong to a family restaurant that let us use them only to measure. They never leave Antón's laptop and never appear here; the repository holds aggregate numbers only, and a hook blocks any commit with real data." />
          </p>
        </section>
      </div>
    </main>
  );
}
