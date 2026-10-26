// The two agents with a scripted model: what code accepts as evidence, never what the model says.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type OpenAI from "openai";
import type { AlbaranLeido, Caja, Campo, LineaLeida } from "../albaran/schema";
import { comprobar, inferirIva } from "../checks/engine";
import { normalize } from "../albaran/normalize";
import { ENCIMERA_CONTEXTO, PROVEEDORES } from "../demo/notas";
import { prepararReclamacion } from "./expediente";
import { investigar } from "./investigar";

const caja = (y: number): Caja => ({ x_min: 50, y_min: y, x_max: 950, y_max: y + 30 });
const c = (texto: string | null, y = 300): Campo => ({ texto, caja: texto == null ? null : caja(y) });
const linea = (y: number, desc: string, cant: string, unidad: string, precio: string, importe: string, iva = "10"): LineaLeida => ({
  descripcion: c(desc, y), cantidad: c(cant, y), unidad, precio_unitario: c(precio, y), descuento_pct: c(null), importe: c(importe, y), iva_pct: c(iva, y), caja_fila: caja(y),
});
const nota = (proveedor: string, numero: string, lineas: LineaLeida[], impuestos: AlbaranLeido["impuestos"], total: string): AlbaranLeido => ({
  rotacion_para_leer: 0, proveedor: c(proveedor, 40), nif_proveedor: c(null), numero: c(numero, 60), fecha: c("06/10/2026", 80),
  lineas, impuestos, total: c(total, 800), filas_de_producto_contadas: lineas.length, ilegible: [],
});
const iva = (pct: string, base: string, cuota: string) => ({ iva_pct: c(pct, 700), base: c(base, 700), cuota: c(cuota, 700) });

/** A fake Responses API: vision calls answer from `ver`, agent rounds replay `rondas` in order. */
function modelo(rondas: { name: string; args: Record<string, unknown> }[][], ver: (prompt: string) => unknown | Promise<unknown>) {
  let r = 0, id = 0;
  const llamadas: string[] = [];
  const client = {
    responses: {
      create: async (p: { tools?: unknown[]; input: { content?: unknown }[] }) => {
        if (p.tools) {
          const calls = rondas[r++] ?? [];
          llamadas.push(...calls.map((x) => x.name));
          return { output: calls.map((x) => ({ type: "function_call", name: x.name, arguments: JSON.stringify(x.args), call_id: `c${++id}` })), output_text: "", usage: { input_tokens: 100, output_tokens: 10 } };
        }
        const prompt = ((p.input[0].content as { type: string; text?: string }[]).find((x) => x.type === "input_text")?.text) ?? "";
        return { output: [], output_text: JSON.stringify(await ver(prompt)), usage: { input_tokens: 500, output_tokens: 20 } };
      },
    },
  };
  return { client: client as unknown as OpenAI, llamadas };
}

const imagen = await sharp({ create: { width: 700, height: 900, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
const fila = (cantidad: string, precio: string, importe: string) => ({ cantidad, precio_unitario: precio, importe, descuento_pct: null, numeros_en_la_fila: [cantidad, precio, importe], linea_visible: true });

describe("claim file (prepararReclamacion)", () => {
  const musel = nota(PROVEEDORES.musel.nombre, "A-1406", [linea(300, "Merluza volanta", "6,20", "kg", "11,90", "73,78"), linea(340, "Rape", "2,10", "kg", "16,50", "34,65")], [iva("10", "108,43", "10,84")], "119,27");
  const avisosMusel = () => comprobar(inferirIva(normalize("doc1", musel)), ENCIMERA_CONTEXTO);

  it("finds the price rise first (code, from history)", () => {
    const a = avisosMusel();
    expect(a.map((x) => x.codigo)).toEqual(["SUBIDA"]);
    expect(a[0].centimos).toBe(744);
  });

  it("confirms a price rise only with a zoomed re-read that shows the same printed numbers", async () => {
    const { client, llamadas } = modelo(
      [[{ name: "releer_fila", args: { linea: 1 } }, { name: "historial_precio", args: { linea: 1 } }], [{ name: "cerrar_expediente", args: { reclamaciones: [{ n: 1, evidencias: ["ev1", "ev2"] }], explicacion: "Confirmado en el papel." } }]],
      () => fila("6,20", "11,90", "73,78"),
    );
    const e = await prepararReclamacion("doc1", musel, imagen, ENCIMERA_CONTEXTO, avisosMusel(), { client });
    expect(llamadas).toEqual(["releer_fila", "historial_precio", "cerrar_expediente"]);
    expect(e.puntos).toEqual([expect.objectContaining({ codigo: "SUBIDA", estado: "confirmada", evidencias: ["ev1"], registro: "ev2" })]);
    expect(e.avisos[0]).toMatchObject({ codigo: "SUBIDA", centimos: 744, datos: { evidencia: "ev1", registro: "ev2" } });
    expect(e.sello).toBe("CON_RESERVAS");
    expect(e.evidencias.find((x) => x.id === "ev1")?.recorte).toBeDefined();
  });

  it("holds the claim back when the re-read shows a different price, even if the agent does not cite it", async () => {
    const { client } = modelo(
      [[{ name: "releer_fila", args: { linea: 1 } }], [{ name: "cerrar_expediente", args: { reclamaciones: [{ n: 1, evidencias: [] }], explicacion: "" } }]],
      () => fila("6,20", "10,90", "73,78"),
    );
    const e = await prepararReclamacion("doc1", musel, imagen, ENCIMERA_CONTEXTO, avisosMusel(), { client });
    expect(e.puntos[0]).toMatchObject({ estado: "retenida", contradiccion: { campo: "precio_unitario", primera: "11,90", relectura: "10,90" } });
    expect(e.avisos.some((a) => a.codigo === "SUBIDA")).toBe(false);
    expect(e.avisos[0]).toMatchObject({ codigo: "ILEGIBLE", clase: "lectura", datos: { motivo: "relectura_distinta" } });
    expect(e.sello).toBe("REVISAR");
  });

  it("does not confirm a claim that cites evidence that does not exist", async () => {
    const { client } = modelo(
      [[{ name: "releer_fila", args: { linea: 1 } }], [{ name: "cerrar_expediente", args: { reclamaciones: [{ n: 1, evidencias: ["ev1", "ev9"] }], explicacion: "" } }]],
      () => fila("6,20", "11,90", "73,78"),
    );
    const e = await prepararReclamacion("doc1", musel, imagen, ENCIMERA_CONTEXTO, avisosMusel(), { client });
    expect(e.valido).toBe(false);
    expect(e.motivo).toBe("cita_evidencias_inexistentes");
    expect(e.puntos[0].estado).toBe("sin_confirmar");
    expect(e.avisos[0]).toMatchObject({ codigo: "SUBIDA", datos: { sinConfirmar: 1 } });
  });

  it("attaches the order itself when the agent did not pull it, and numbers evidence after the investigator's", async () => {
    const huerta = nota(PROVEEDORES.huerta.nombre, "0388", [linea(300, "Tomate", "12,000", "kg", "1,85", "22,20", "4")], [iva("4", "22,20", "0,89")], "23,09");
    const avisos = comprobar(inferirIva(normalize("doc2", huerta)), ENCIMERA_CONTEXTO);
    expect(avisos.map((a) => a.codigo)).toEqual(["FALTA"]);
    const { client } = modelo(
      [[{ name: "releer_celda", args: { linea: 1, campo: "cantidad" } }], [{ name: "cerrar_expediente", args: { reclamaciones: [{ n: 1, evidencias: ["ev3"] }], explicacion: "" } }]],
      () => ({ linea_visible: true, texto: "12,000", legible: true }),
    );
    const e = await prepararReclamacion("doc2", huerta, imagen, ENCIMERA_CONTEXTO, avisos, { client, primeraEvidencia: 3 });
    expect(e.puntos[0]).toMatchObject({ estado: "confirmada", evidencias: ["ev3"], registro: "ev4" });
    expect(e.evidencias.map((x) => [x.id, x.herramienta])).toEqual([["ev3", "releer_celda"], ["ev4", "pedido"]]);
  });

  it("does nothing when there is no money claim to confirm", async () => {
    const { client, llamadas } = modelo([], () => ({}));
    const e = await prepararReclamacion("doc1", musel, imagen, { historial: [], registrados: [], pedidos: [] }, [], { client });
    expect(e.preparado).toBe(false);
    expect(llamadas).toEqual([]);
  });
});

describe("investigator (investigar)", () => {
  const bebidas = nota(PROVEEDORES.bebidas.nombre, "77120", [linea(300, "Agua mineral 50 cl", "24", "ud", "0,350", "8,40"), linea(340, "Refresco cola 33 cl", "24", "ud", "0,950", "28,20")], [iva("10", "36,60", "3,66")], "40,26");

  it("turns a line that does not add up into a supplier error only after the printed amount is confirmed", async () => {
    const { client } = modelo(
      [[{ name: "releer_fila", args: { linea: 2 } }], [{ name: "cerrar", args: { veredicto: "error_proveedor", evidencias: ["ev1"], correcciones: [], explicacion: "Mal calculada." } }]],
      () => fila("24", "0,950", "28,20"),
    );
    const inv = await investigar("doc3", bebidas, imagen, { historial: [], registrados: [], pedidos: [] }, { client });
    expect(inv.valido).toBe(true);
    expect(inv.avisos.find((a) => a.codigo === "ERROR_PROVEEDOR")).toMatchObject({ centimos: 540, datos: { evidencia: "ev1" } });
  });

  it("rejects a supplier error when another printed number on the row makes the line add up", async () => {
    const { client } = modelo(
      [[{ name: "releer_fila", args: { linea: 2 } }], [{ name: "cerrar", args: { veredicto: "error_proveedor", evidencias: ["ev1"], correcciones: [], explicacion: "" } }]],
      () => ({ ...fila("24", "0,950", "28,20"), numeros_en_la_fila: ["24", "0,950", "28,20", "29,684"] }),
    );
    const inv = await investigar("doc3", bebidas, imagen, { historial: [], registrados: [], pedidos: [] }, { client });
    expect(inv.valido).toBe(false);
    expect(inv.motivo).toBe("otra_cantidad_impresa_cuadra");
    expect(inv.avisos.some((a) => a.codigo === "ERROR_PROVEEDOR")).toBe(false);
  });
});

describe("row boxes and wider crops", () => {
  it("re-places a row box with no height from its neighbours (rows go down the page at a steady pitch)", async () => {
    const { repararCajas } = await import("../albaran/localizar");
    const l3 = { ...linea(220, "Cerveza barril 30 l", "30", "l", "2,100", "63,00", "21"), caja_fila: { x_min: 0, x_max: 945, y_min: 220, y_max: 220 } };
    const n = nota("Bebidas", "1", [linea(330, "Agua", "24", "ud", "0,350", "8,40"), linea(388, "Refresco", "24", "ud", "0,950", "28,20"), l3], [], "1");
    const r = repararCajas(n);
    expect(r.lineas[0].caja_fila).toEqual(n.lineas[0].caja_fila);
    expect(r.lineas[2].caja_fila).toEqual({ x_min: 50, x_max: 950, y_min: 446, y_max: 476 });
    expect(r.lineas[2].importe.caja?.y_min).toBe(446);
    expect(r.lineas[2].importe.texto).toBe("63,00");
    expect(repararCajas(musel())).toEqual(musel());
  });

  it("looks again on the whole table when the line is not in its crop, and says so in the evidence", async () => {
    let vistas = 0;
    const { client } = modelo(
      [[{ name: "releer_celda", args: { linea: 2, campo: "importe" } }], [{ name: "cerrar", args: { veredicto: "revisar", evidencias: ["ev1"], correcciones: [], explicacion: "" } }]],
      () => (++vistas === 1 ? { linea_visible: false, texto: null, legible: false } : { linea_visible: true, texto: "28,20", legible: true }),
    );
    const b = nota("Bebidas", "1", [linea(300, "Agua", "24", "ud", "0,350", "8,40"), linea(340, "Refresco", "24", "ud", "0,950", "28,20")], [iva("10", "36,60", "3,66")], "40,26");
    const inv = await investigar("d", b, imagen, { historial: [], registrados: [], pedidos: [] }, { client });
    expect(vistas).toBe(2);
    expect(inv.evidencias[0]).toMatchObject({ texto: "28,20", datos: { ampliado: true } });
  });
});

function musel() {
  return nota(PROVEEDORES.musel.nombre, "A-1406", [linea(300, "Merluza volanta", "6,20", "kg", "11,90", "73,78"), linea(340, "Rape", "2,10", "kg", "16,50", "34,65")], [iva("10", "108,43", "10,84")], "119,27");
}

describe("agent loop", () => {
  const b = () => nota("Bebidas", "1", [linea(300, "Agua", "24", "ud", "0,350", "8,40"), linea(340, "Refresco", "24", "ud", "0,950", "28,20")], [iva("10", "36,60", "3,66")], "40,26");
  const vacio = { historial: [], registrados: [], pedidos: [] };

  it("runs the tools of one turn together and numbers the evidence in the order asked", async () => {
    let enVuelo = 0, maximo = 0;
    const { client } = modelo(
      [[{ name: "releer_fila", args: { linea: 2 } }, { name: "releer_celda", args: { linea: 2, campo: "importe" } }], [{ name: "cerrar", args: { veredicto: "error_proveedor", evidencias: ["ev1", "ev2"], correcciones: [], explicacion: "" } }]],
      async (prompt) => {
        enVuelo++; maximo = Math.max(maximo, enVuelo);
        const fila = prompt.includes("every number printed");
        await new Promise((r) => setTimeout(r, fila ? 60 : 5)); // the first call finishes last
        enVuelo--;
        return fila ? { cantidad: "24", precio_unitario: "0,950", importe: "28,20", descuento_pct: null, numeros_en_la_fila: ["24", "0,950", "28,20"], linea_visible: true } : { linea_visible: true, texto: "28,20", legible: true };
      },
    );
    const inv = await investigar("d", b(), imagen, vacio, { client });
    expect(maximo).toBe(2);
    expect(inv.evidencias.map((e) => [e.id, e.herramienta])).toEqual([["ev1", "releer_fila"], ["ev2", "releer_celda"]]);
    expect(inv.pasos.map((p) => [p.herramienta, p.evidenciaId])).toEqual([["releer_fila", "ev1"], ["releer_celda", "ev2"], ["cerrar", undefined]]);
    expect(inv.valido).toBe(true);
  });

  it("when time runs out, offers only the closing tool instead of ending without a verdict", async () => {
    const ofrecidas: string[][] = [];
    const { client } = modelo([[{ name: "cerrar", args: { veredicto: "revisar", evidencias: [], correcciones: [], explicacion: "Sin tiempo para mirar." } }]], () => ({}));
    const create = client.responses.create.bind(client.responses);
    (client.responses as unknown as { create: (p: { tools?: { name: string }[] }) => unknown }).create = (p: { tools?: { name: string }[] }) => { if (p.tools) ofrecidas.push(p.tools.map((x) => x.name)); return create(p as never); };
    const inv = await investigar("d", b(), imagen, vacio, { client, maxMs: 0 });
    expect(ofrecidas).toEqual([["cerrar"]]);
    expect(inv).toMatchObject({ veredicto: "revisar", valido: true });
  });
});
