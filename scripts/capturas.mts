// Screenshots of the session replay at desktop and phone widths (for design review).
// Usage: npx tsx scripts/capturas.mts [url] [segundos]
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:3000/sesion?muestra=encimera";
const espera = Number(process.argv[3] ?? 12);
const browser = await chromium.launch({ channel: "chrome" });
for (const [nombre, w, h] of [["desktop", 1440, 900], ["movil", 390, 844]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errores: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "×4" }).click();
  await page.waitForTimeout(espera * 1000);
  await page.screenshot({ path: `.smoke/cap_${nombre}.png`, fullPage: true });
  console.log(nombre, "errores:", errores.length ? errores.slice(0, 5) : "ninguno");
  await page.close();
}
await browser.close();
