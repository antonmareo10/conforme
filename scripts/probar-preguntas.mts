// Open the month sample, tap the example questions, capture each answer (text + screenshot).
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-ES" });
const page = await ctx.newPage();
const errores: string[] = [];
page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3000/sesion?muestra=mes", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const chips = ["¿Cuánto he pagado de más este mes?", "¿Qué ha subido de precio?", "¿Cuánto me ha cobrado Cárnicas del Nalón este mes?", "¿A cuánto me cobraron la ternera la última vez?"];
for (const [i, q] of chips.entries()) {
  await page.getByRole("button", { name: q }).click();
  await page.waitForTimeout(1800);
  const sec = page.locator("section[aria-labelledby=preguntas]");
  console.log(q, "→", (await sec.innerText()).split("\n").slice(-4).join(" | "));
  if (i === 0) await page.screenshot({ path: ".smoke/preguntas_1.png" });
}
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
