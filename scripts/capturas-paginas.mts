// Screenshots of static pages at desktop and phone widths, with console errors.
import { chromium } from "playwright";
const pages = process.argv.slice(2);
const espera = 9000;
const browser = await chromium.launch({ channel: "chrome" });
for (const p of pages) {
  for (const [nombre, w, h] of [["desktop", 1440, 900], ["movil", 390, 844]] as const) {
    for (const lang of ["es", "en"]) {
      if (nombre === "movil" && lang === "en") continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: lang === "es" ? "es-ES" : "en-GB" });
      const page = await ctx.newPage();
      const errores: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
      page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
      await page.goto(`http://localhost:3000${p}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(espera);
      const f = `.smoke/pag_${p.replace(/\W/g, "_") || "home"}_${nombre}_${lang}.png`;
      await page.screenshot({ path: f, fullPage: true });
      console.log(f, errores.length ? errores : "sin errores");
      await ctx.close();
    }
  }
}
await browser.close();
