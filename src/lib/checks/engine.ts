// Every euro is checked here, in plain code. The model reads the paper; it never decides a number,
// whether a line is right, a reference price, a duplicate or a stamp.
import { moneyTolerance, toCents, type ParsedNumber } from "../numbers";
import { isValidNif } from "./nif";
import { CLASE, type Albaran, type Aviso, type CodigoAviso, type Contexto, type Linea, type Sello } from "./types";

const aviso = (codigo: CodigoAviso, docId: string, centimos: number, datos: Aviso["datos"], lineaIdx?: number): Aviso => ({
  codigo,
  clase: CLASE[codigo],
  docId,
  lineaIdx,
  centimos,
  datos,
});

const cands = (p: ParsedNumber | null) => (p ? p.candidates : []);

export interface ResultadoLinea {
  ok: boolean;
  /** Interpretation that makes the line add up (or the most likely one when it does not). */
  cantidad: number | null;
  precio: number | null;
  importeCents: number | null;
  esperadoCents: number | null;
  difCents: number;
}

/** quantity × price × (1 − discount) against the printed amount, trying every plausible reading. */
export function aritmeticaLinea(l: Linea): ResultadoLinea | null {
  if (!l.cantidad || !l.precio || !l.importe) return null;
  const descuentos = l.descuentoPct ? cands(l.descuentoPct) : [0];
  let best: ResultadoLinea | null = null;
  for (const q of cands(l.cantidad))
    for (const p of cands(l.precio))
      for (const d of descuentos)
        for (const imp of cands(l.importe)) {
          const esperado = toCents(q * p * (1 - d / 100));
          const impCents = toCents(imp);
          const dif = impCents - esperado;
          const r = { ok: Math.abs(dif) <= moneyTolerance(impCents), cantidad: q, precio: p, importeCents: impCents, esperadoCents: esperado, difCents: dif };
          if (r.ok) return r;
          best ??= r; // first combination = most likely reading
        }
  return best;
}

export function importeLinea(l: Linea): number | null {
  const r = aritmeticaLinea(l);
  if (r?.ok) return r.importeCents;
  return l.importe ? toCents(l.importe.candidates[0]) : null;
}

/** Normalised product key for price history: lowercase, no accents, no leading code, single spaces. */
export function claveProducto(descripcion: string | null): string {
  return (descripcion ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*\d+\s+/, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const claveProveedor = claveProducto;

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const DIAS = 86_400_000;

export function precioReferencia(ctx: Contexto, proveedor: string | null, producto: string, fecha: string | null) {
  const prov = claveProveedor(proveedor);
  const antes = ctx.historial
    .filter((c) => claveProveedor(c.proveedor) === prov && claveProducto(c.producto) === producto && (!fecha || c.fecha < fecha))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!antes.length) return null;
  const ultimo = antes[antes.length - 1];
  const limite = fecha ? new Date(fecha).getTime() - 42 * DIAS : -Infinity;
  const ventana = antes.filter((c) => new Date(c.fecha).getTime() >= limite).map((c) => c.precioUnit);
  return { ultimo: ultimo.precioUnit, mediana: ventana.length ? mediana(ventana) : ultimo.precioUnit, unidad: ultimo.unidad, n: ventana.length };
}

/** Unreadable fields that touch money make the note doubtful; a blurry name or tax ID does not. */
const CAMPO_DE_DINERO = /cantidad|precio|importe|base|cuota|total|iva|descuento|dto|unidades|peso/i;

/**
 * Fill the VAT rate of lines that do not print one, from the tax table: with one rate, every line
 * gets it; with several, the only split of lines whose sums match the printed bases. Code decides.
 */
export function inferirIva(a: Albaran): Albaran {
  const tipos = a.impuestos.filter((t) => t.ivaPct != null && t.base);
  const faltan = a.lineas.filter((l) => l.ivaPct == null);
  if (!faltan.length || !tipos.length) return a;
  if (tipos.length === 1) {
    const iva = tipos[0].ivaPct;
    return { ...a, ivaInferido: true, lineas: a.lineas.map((l) => (l.ivaPct == null ? { ...l, ivaPct: iva } : l)) };
  }
  const reparto = repartoPorTipo(a);
  if (!reparto) return a;
  return { ...a, ivaInferido: true, lineas: a.lineas.map((l, i) => ({ ...l, ivaPct: reparto[i] })) };
}

/** Search an assignment of lines to VAT rates whose per-rate sums equal the printed bases (±0,02 €). */
function repartoPorTipo(a: Albaran): number[] | null {
  const tipos = a.impuestos.filter((t) => t.ivaPct != null && t.base).map((t) => ({ iva: t.ivaPct as number, base: toCents(t.base!.candidates[0]) }));
  const cents = a.lineas.map((l) => importeLinea(l));
  if (cents.some((c) => c == null) || a.lineas.length > 14 || tipos.length > 3) return null;
  const fijo = a.lineas.map((l) => l.ivaPct);
  const asign: number[] = new Array(a.lineas.length);
  const sumas = new Map(tipos.map((t) => [t.iva, 0]));
  let encontrado: number[] | null = null;
  const go = (i: number) => {
    if (encontrado) return;
    if (i === a.lineas.length) {
      if (tipos.every((t) => Math.abs((sumas.get(t.iva) ?? 0) - t.base) <= 2)) encontrado = [...asign];
      return;
    }
    const opciones = fijo[i] != null ? [fijo[i] as number] : tipos.map((t) => t.iva);
    for (const iva of opciones) {
      if (!sumas.has(iva)) continue;
      asign[i] = iva;
      sumas.set(iva, (sumas.get(iva) ?? 0) + (cents[i] as number));
      go(i + 1);
      sumas.set(iva, (sumas.get(iva) ?? 0) - (cents[i] as number));
    }
  };
  go(0);
  return encontrado;
}

export function comprobar(a: Albaran, ctx: Contexto): Aviso[] {
  const avisos: Aviso[] = [];
  const conPrecio = a.lineas.filter((l) => l.precio || l.importe);

  for (const campo of a.ilegible) {
    const av = aviso("ILEGIBLE", a.docId, 0, { campo });
    avisos.push(CAMPO_DE_DINERO.test(campo) ? av : { ...av, clase: "info" });
  }
  for (const campo of a.noNumericos ?? []) avisos.push(aviso("ILEGIBLE", a.docId, 0, { campo, motivo: "no_numerico" }));

  if (a.filasContadas != null && a.filasContadas !== a.lineas.length)
    avisos.push(aviso("RECUENTO_FILAS", a.docId, 0, { contadas: a.filasContadas, leidas: a.lineas.length }));

  if (a.nif && !isValidNif(a.nif)) avisos.push(aviso("NIF", a.docId, 0, { nif: a.nif }));

  if (a.lineas.length && !conPrecio.length) {
    avisos.push(aviso("SIN_PRECIOS", a.docId, 0, {}));
  } else {
    // Line arithmetic.
    for (const l of a.lineas) {
      const r = aritmeticaLinea(l);
      const evidencia = a.confirmados?.[l.idx];
      if (r && !r.ok && evidencia && r.difCents > 0)
        avisos.push(aviso("ERROR_PROVEEDOR", a.docId, r.difCents, {
          cantidad: r.cantidad ?? 0, precio: r.precio ?? 0, esperadoCents: r.esperadoCents ?? 0, impresoCents: r.importeCents ?? 0, difCents: r.difCents, evidencia,
        }, l.idx));
      else if (r && !r.ok)
        avisos.push(
          aviso("ARITMETICA_LINEA", a.docId, 0, {
            cantidad: r.cantidad ?? 0,
            precio: r.precio ?? 0,
            esperadoCents: r.esperadoCents ?? 0,
            impresoCents: r.importeCents ?? 0,
            difCents: r.difCents,
          }, l.idx),
        );
    }
    const t = totales(a);
    if (t && !t.ok) avisos.push(aviso("TOTALES", a.docId, 0, { difCents: t.difCents, motivo: t.motivo }));

    // Prices against history.
    for (const l of a.lineas) {
      const r = aritmeticaLinea(l);
      const precio = r?.ok ? r.precio : l.precio?.candidates[0];
      const cantidad = r?.ok ? r.cantidad : l.cantidad?.candidates[0];
      if (precio == null || !l.descripcion) continue;
      const ref = precioReferencia(ctx, a.proveedor, claveProducto(l.descripcion), a.fecha);
      if (!ref) continue;
      const unidadDistinta = !!(ref.unidad && l.unidad && ref.unidad.toLowerCase() !== l.unidad.toLowerCase());
      const subida = precio / ref.mediana - 1;
      if (unidadDistinta || subida > 0.6) {
        avisos.push(aviso("SALTO_RARO", a.docId, 0, { pct: Math.round(subida * 1000) / 10, precio, referencia: ref.mediana }, l.idx));
      } else if (subida > 0.03 && precio - ref.mediana > 0.2 && precio > ref.ultimo) {
        const centimos = cantidad != null ? toCents((precio - ref.mediana) * cantidad) : 0;
        avisos.push(aviso("SUBIDA", a.docId, centimos, { pct: Math.round(subida * 1000) / 10, precio, referencia: ref.mediana, cantidad: cantidad ?? 0 }, l.idx));
      }
    }
  }

  // Against the order, when the session has one.
  const pedidosProv = ctx.pedidos.filter((p) => claveProveedor(p.proveedor) === claveProveedor(a.proveedor));
  for (const p of pedidosProv) {
    const l = a.lineas.find((x) => claveProducto(x.descripcion) === claveProducto(p.producto));
    if (!l) continue;
    const r = aritmeticaLinea(l);
    const recibido = r?.ok ? r.cantidad : l.cantidad?.candidates[0];
    const precio = r?.ok ? r.precio : l.precio?.candidates[0];
    if (recibido == null) continue;
    const tolerancia = esAlPeso(l.unidad ?? p.unidad) ? p.cantidad * 0.03 : 0;
    const dif = p.cantidad - recibido;
    if (dif > tolerancia + 1e-9) {
      avisos.push(aviso("FALTA", a.docId, precio != null ? toCents(dif * precio) : 0, { faltan: redondear(dif), unidad: l.unidad ?? p.unidad ?? "", pedido: p.cantidad, recibido }, l.idx));
    } else if (-dif > tolerancia + 1e-9) {
      avisos.push(aviso("SOBRA", a.docId, 0, { sobran: redondear(-dif), unidad: l.unidad ?? p.unidad ?? "" }, l.idx));
    }
  }

  // Duplicates against notes already logged.
  const totalCents = a.total ? toCents(a.total.candidates[0]) : null;
  const dup = ctx.registrados.find(
    (r) =>
      r.docId !== a.docId &&
      claveProveedor(r.proveedor) === claveProveedor(a.proveedor) &&
      ((r.numero && a.numero && r.numero.replace(/\s/g, "") === a.numero.replace(/\s/g, "")) ||
        (r.fecha && a.fecha && r.fecha === a.fecha && r.totalCents != null && r.totalCents === totalCents)),
  );
  if (dup) avisos.push(aviso("DUPLICADO", a.docId, totalCents ?? 0, { fecha: dup.fecha ?? "", docIdOriginal: dup.docId }));

  return avisos;
}

const redondear = (x: number) => Math.round(x * 1000) / 1000;
const esAlPeso = (u: string | null) => !!u && /^(kg|kgs|kilo|kilos|g|gr|l|lt|litro|litros)$/i.test(u.trim());

export interface ResultadoTotales {
  ok: boolean;
  difCents: number;
  motivo: "suma_base" | "cuota" | "total" | "suma_total";
}

/** Σ lines per VAT rate = base; base × rate = VAT; bases + VAT = total (±0.02 €). */
export function totales(a: Albaran): ResultadoTotales | null {
  const lineas = a.lineas.map((l) => ({ l, cents: importeLinea(l) })).filter((x) => x.cents != null) as { l: Linea; cents: number }[];
  const tol = 2;
  if (a.impuestos.length) {
    // Several rates and lines without a printed rate: the lines must split exactly into the bases.
    if (a.impuestos.length > 1 && lineas.some((x) => x.l.ivaPct == null) && lineas.length === a.lineas.length) {
      if (!repartoPorTipo(a)) {
        const suma = lineas.reduce((s, x) => s + x.cents, 0);
        const bases = a.impuestos.reduce((s, t) => s + (t.base ? toCents(t.base.candidates[0]) : 0), 0);
        return { ok: false, difCents: bases - suma, motivo: "suma_base" };
      }
    }
    for (const t of a.impuestos) {
      if (!t.base) continue;
      const base = toCents(t.base.candidates[0]);
      const delTipo = lineas.filter((x) => t.ivaPct == null || x.l.ivaPct == null || x.l.ivaPct === t.ivaPct);
      // Only compare the sum when every line of this rate was read with an amount.
      if (a.impuestos.length === 1 || delTipo.every((x) => x.l.ivaPct != null)) {
        const suma = delTipo.reduce((s, x) => s + x.cents, 0);
        if (delTipo.length && Math.abs(suma - base) > tol) return { ok: false, difCents: base - suma, motivo: "suma_base" };
      }
      if (t.cuota && t.ivaPct != null) {
        const cuota = toCents(t.cuota.candidates[0]);
        const esperada = toCents((base / 100) * (t.ivaPct / 100));
        if (Math.abs(cuota - esperada) > tol) return { ok: false, difCents: cuota - esperada, motivo: "cuota" };
      }
    }
    if (a.total) {
      const total = toCents(a.total.candidates[0]);
      const suma = a.impuestos.reduce((s, t) => s + (t.base ? toCents(t.base.candidates[0]) : 0) + (t.cuota ? toCents(t.cuota.candidates[0]) : 0), 0);
      if (Math.abs(total - suma) > tol) return { ok: false, difCents: total - suma, motivo: "total" };
    }
    return { ok: true, difCents: 0, motivo: "total" };
  }
  if (a.total && lineas.length) {
    const total = toCents(a.total.candidates[0]);
    const suma = lineas.reduce((s, x) => s + x.cents, 0);
    // Without a tax table the total may be net or VAT-inclusive.
    const tipos = new Set(lineas.map((x) => x.l.ivaPct).filter((x): x is number => x != null));
    const conIva = tipos.size === 1 ? toCents((suma / 100) * (1 + [...tipos][0] / 100)) : null;
    const ok = Math.abs(total - suma) <= tol || (conIva != null && Math.abs(total - conIva) <= tol);
    return { ok, difCents: ok ? 0 : total - suma, motivo: "suma_total" };
  }
  return null;
}

/** REVISAR beats CON RESERVAS: a doubtful reading is never stamped as checked. */
export function sello(avisos: Aviso[]): Sello {
  if (avisos.some((x) => x.clase === "lectura")) return "REVISAR";
  if (avisos.some((x) => x.clase === "dinero" && x.centimos > 0)) return "CON_RESERVAS";
  return "CONFORME";
}

export function enJuego(avisos: Aviso[]) {
  const por = (c: CodigoAviso) => avisos.filter((x) => x.codigo === c).reduce((s, x) => s + x.centimos, 0);
  const desglose = { subidas: por("SUBIDA"), faltas: por("FALTA"), erroresProveedor: por("ERROR_PROVEEDOR"), duplicados: por("DUPLICADO") };
  return { totalCents: desglose.subidas + desglose.faltas + desglose.erroresProveedor + desglose.duplicados, desglose };
}
