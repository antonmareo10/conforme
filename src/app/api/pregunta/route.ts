// POST /api/pregunta — multipart: "audio" (WAV, optional) or "texto", plus "proveedores" and
// "productos" (JSON arrays from the session). Returns what was heard and the structured intent;
// the browser computes the answer from the session's notes with src/lib/preguntas.ts.
import { z } from "zod";
import { interpretar, transcribir } from "@/lib/intencion";
import { ipDe } from "@/lib/limites";

export const maxDuration = 30;

const Lista = z.array(z.string().max(200)).max(400);
const porIp = new Map<string, { n: number; hasta: number }>();

export async function POST(request: Request) {
  // 30 questions per IP per hour (in-memory is enough here: each call costs a fraction of a cent).
  const ip = ipDe(request);
  const ahora = Date.now();
  const v = porIp.get(ip);
  if (v && v.hasta > ahora && v.n >= 30) return Response.json({ error: "TOPE_IP" }, { status: 429 });
  porIp.set(ip, !v || v.hasta < ahora ? { n: 1, hasta: ahora + 3_600_000 } : { n: v.n + 1, hasta: v.hasta });
  if (process.env.LIVE_DISABLED === "1") return Response.json({ error: "SIN_DIRECTO" }, { status: 429 });

  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Formulario no válido" }, { status: 400 }); }
  let proveedores: string[], productos: string[];
  try {
    proveedores = Lista.parse(JSON.parse(String(form.get("proveedores") ?? "[]")));
    productos = Lista.parse(JSON.parse(String(form.get("productos") ?? "[]")));
  } catch {
    return Response.json({ error: "Listas no válidas" }, { status: 400 });
  }
  try {
    let texto = String(form.get("texto") ?? "").trim();
    let transcripcion: string | null = null;
    const audio = form.get("audio");
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > 2_000_000) return Response.json({ error: "Audio demasiado largo" }, { status: 413 });
      transcripcion = (await transcribir(audio)).texto;
      texto = transcripcion;
    }
    if (!texto) return Response.json({ error: "Sin pregunta" }, { status: 400 });
    const consulta = await interpretar(texto, proveedores, productos);
    return Response.json({ transcripcion, texto, consulta });
  } catch (e) {
    return Response.json({ error: (e as Error).message.slice(0, 200) }, { status: 502 });
  }
}
