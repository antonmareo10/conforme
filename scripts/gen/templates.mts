// HTML for fictional delivery notes. Every field that the reader must find carries data-f="<key>",
// so the renderer can measure its true box. Keys mirror the reading schema.
import { importeLinea, impuestos, type NotaDemo } from "../../src/lib/demo/notas";

export const CLIENTE = { nombre: "Casa Nela", direccion: "C/ del Puerto 3 · 33201 Gijón (ficticio)" };

/** Spanish printed number: comma decimals, dot thousands. */
export function es(n: number, dec: number): string {
  const [i, d] = Math.abs(n).toFixed(dec).split(".");
  const miles = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${miles}${d ? "," + d : ""}`;
}
const fecha = (iso: string, corto = false) => {
  const [y, m, d] = iso.split("-");
  return corto ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}/${y}`;
};
const f = (key: string, text: string, cls = "") => `<span data-f="${key}"${cls ? ` class="${cls}"` : ""}>${text}</span>`;

const DEMO = `<div class="demo">DEMO · datos ficticios · fictional sample</div>`;

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff}
.demo{font:600 11px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#b33;opacity:.75}
table{border-collapse:collapse;width:100%}
`;

function a4(n: NotaDemo): string {
  const imp = impuestos(n);
  const filas = n.lineas.map((l, i) => `
    <tr data-f="linea-${i}-fila">
      <td>${l.codigo ?? ""}</td>
      <td>${f(`linea-${i}-descripcion`, l.descripcion)}</td>
      <td class="r">${f(`linea-${i}-cantidad`, es(l.cantidad, l.decCantidad))}</td>
      <td>${l.unidad}</td>
      <td class="r">${f(`linea-${i}-precio_unitario`, es(l.precio, l.decPrecio))}</td>
      <td class="r">${l.descuentoPct ? f(`linea-${i}-descuento_pct`, es(l.descuentoPct, 0)) : ""}</td>
      <td class="r">${f(`linea-${i}-importe`, es(importeLinea(l), 2))}</td>
      <td class="r">${f(`linea-${i}-iva_pct`, String(l.iva))}</td>
    </tr>`).join("");
  const tax = imp.filas.map((t, j) => `
    <tr><td class="r">${f(`imp-${j}-base`, es(t.base, 2))}</td><td class="r">${f(`imp-${j}-iva_pct`, es(t.iva, 2))} %</td><td class="r">${f(`imp-${j}-cuota`, es(t.cuota, 2))}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
  .paper{width:794px;min-height:1000px;padding:56px 56px 40px;font:13px/1.45 "Helvetica Neue",Arial,sans-serif;color:#1d1d1f;background:#fffdf8}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d3b6a;padding-bottom:14px}
  .brand{font:700 22px/1.1 Georgia,serif;color:#1d3b6a} .small{font-size:11px;color:#444}
  .doc{border:1.5px solid #1d3b6a;padding:8px 12px;text-align:right;min-width:210px}
  .doc b{font-size:15px;letter-spacing:.06em;color:#1d3b6a}
  .cli{margin:16px 0 18px;padding:8px 12px;background:#f1f0ea;width:55%}
  .lines th{background:#1d3b6a;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:6px 6px;text-align:left}
  .lines td{padding:7px 6px;border-bottom:1px solid #ddd8cc}
  .r{text-align:right} .lines th.r{text-align:right}
  .bottom{display:flex;justify-content:space-between;margin-top:26px;align-items:flex-end}
  .tax{width:330px} .tax th{font-size:11px;color:#555;text-align:right;padding:3px 6px;border-bottom:1px solid #999} .tax td{padding:4px 6px}
  .total{font:700 18px/1 Arial,sans-serif;border:2px solid #1d3b6a;padding:10px 14px}
  .firma{margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;font-size:11px;color:#555}
  </style></head><body><div class="paper">
    <div class="top">
      <div><div class="brand">${f("proveedor", n.proveedor.nombre)}</div>
        <div class="small">${n.proveedor.direccion}<br>CIF ${f("nif_proveedor", n.proveedor.nif)} · Tel. ${n.proveedor.telefono}</div></div>
      <div class="doc"><b>ALBARÁN</b><br>Nº ${f("numero", n.numero)}<br>Fecha ${f("fecha", fecha(n.fecha))}</div>
    </div>
    <div class="cli"><b>Cliente:</b> ${CLIENTE.nombre}<br><span class="small">${CLIENTE.direccion}</span></div>
    <table class="lines"><thead><tr><th>Cód.</th><th>Descripción</th><th class="r">Cantidad</th><th>Ud</th><th class="r">Precio</th><th class="r">Dto %</th><th class="r">Importe</th><th class="r">IVA</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="bottom">
      <table class="tax"><thead><tr><th>Base imponible</th><th>% IVA</th><th>Cuota</th></tr></thead><tbody>${tax}</tbody></table>
      <div class="total">TOTAL ${f("total", es(imp.total, 2))} €</div>
    </div>
    <div class="firma"><div>Recibí conforme: ______________________</div>${DEMO}</div>
  </div></body></html>`;
}

function ticket(n: NotaDemo): string {
  const imp = impuestos(n);
  const filas = n.lineas.map((l, i) => `
    <div class="row" data-f="linea-${i}-fila">${f(`linea-${i}-descripcion`, l.descripcion.toUpperCase(), "desc")}
      <span class="nums">${f(`linea-${i}-cantidad`, es(l.cantidad, l.decCantidad))} ${l.unidad} x ${f(`linea-${i}-precio_unitario`, es(l.precio, l.decPrecio))}</span>
      ${f(`linea-${i}-importe`, es(importeLinea(l), 2), "amt")}</div>`).join("");
  const tax = imp.filas.map((t, j) => `<div class="taxrow">${f(`imp-${j}-iva_pct`, es(t.iva, 2))}% &nbsp; ${f(`imp-${j}-base`, es(t.base, 2))} &nbsp; ${f(`imp-${j}-cuota`, es(t.cuota, 2))}</div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
  .paper{width:400px;padding:30px 26px 34px;font:15px/1.5 "Consolas","Courier New",monospace;color:#2b2b2b;background:#fbfbf8}
  .c{text-align:center} .hr{border-top:1px dashed #888;margin:10px 0}
  .row{display:grid;grid-template-columns:1fr auto;column-gap:10px} .row .nums{grid-column:1;font-size:13px;color:#444} .row .amt{grid-column:2;grid-row:1/3;align-self:end}
  .desc{grid-column:1}
  .tot{font-size:19px;font-weight:700;text-align:right;margin-top:8px}
  .taxrow{white-space:nowrap}
  </style></head><body><div class="paper">
    <div class="c"><b>${f("proveedor", n.proveedor.nombre.toUpperCase())}</b><br>${n.proveedor.direccion}<br>NIF ${f("nif_proveedor", n.proveedor.nif)}</div>
    <div class="hr"></div>
    <div>ALBARAN ${f("numero", n.numero)}<br>FECHA ${f("fecha", fecha(n.fecha, true))}<br>CLIENTE: ${CLIENTE.nombre.toUpperCase()}</div>
    <div class="hr"></div>${filas}<div class="hr"></div>
    <div>% IVA &nbsp; BASE &nbsp; CUOTA</div>${tax}
    <div class="tot">TOTAL ${f("total", es(imp.total, 2))} EUR</div>
    <div class="hr"></div><div class="c">${DEMO}</div>
  </div></body></html>`;
}

function matricial(n: NotaDemo): string {
  const imp = impuestos(n);
  const filas = n.lineas.map((l, i) => `
    <tr data-f="linea-${i}-fila"><td>${l.codigo ?? ""}</td><td>${f(`linea-${i}-descripcion`, l.descripcion.toUpperCase())}</td>
      <td class="r">${f(`linea-${i}-cantidad`, es(l.cantidad, l.decCantidad))}</td><td class="r">${f(`linea-${i}-precio_unitario`, es(l.precio, l.decPrecio))}</td>
      <td class="r">${f(`linea-${i}-importe`, es(importeLinea(l), 2))}</td><td class="r">${f(`linea-${i}-iva_pct`, String(l.iva))}</td></tr>`).join("");
  const tax = imp.filas.map((t, j) => `<tr><td class="r">${f(`imp-${j}-iva_pct`, es(t.iva, 2))}</td><td class="r">${f(`imp-${j}-base`, es(t.base, 2))}</td><td class="r">${f(`imp-${j}-cuota`, es(t.cuota, 2))}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=VT323&display=block" rel="stylesheet"><style>${BASE_CSS}
  .paper{width:860px;padding:40px 48px;font:22px/1.25 "VT323","Courier New",monospace;color:#3d3d55;background:#fbfaf3;
    background-image:repeating-linear-gradient(#fbfaf3 0 44px,#eef3ea 44px 88px)}
  .r{text-align:right} td{padding:2px 8px} .head{display:flex;justify-content:space-between}
  .tot{font-size:28px;text-align:right;margin-top:12px}
  </style></head><body><div class="paper">
    <div class="head"><div>${f("proveedor", n.proveedor.nombre.toUpperCase())}<br>${n.proveedor.direccion.toUpperCase()}<br>C.I.F. ${f("nif_proveedor", n.proveedor.nif)}</div>
      <div class="r">ALBARAN N. ${f("numero", n.numero)}<br>FECHA ${f("fecha", fecha(n.fecha))}<br>CLIENTE ${CLIENTE.nombre.toUpperCase()}</div></div>
    <br><table><tr><td>CODIGO</td><td>DESCRIPCION</td><td class="r">CANT.</td><td class="r">PRECIO</td><td class="r">IMPORTE</td><td class="r">%IVA</td></tr>${filas}</table>
    <br><table style="width:55%"><tr><td class="r">%IVA</td><td class="r">BASE</td><td class="r">CUOTA</td></tr>${tax}</table>
    <div class="tot">TOTAL EUROS ${f("total", es(imp.total, 2))}</div>
    <br>${DEMO}
  </div></body></html>`;
}

export function html(n: NotaDemo): string {
  if (n.plantilla === "ticket") return ticket(n);
  if (n.plantilla === "matricial") return matricial(n);
  return a4(n);
}
