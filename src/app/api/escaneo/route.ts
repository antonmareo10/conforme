// POST /api/escaneo — multipart with 1-3 photos (field "fotos") and an optional session context
// (field "contexto", JSON). Answers with Server-Sent Events, one per real pipeline step.
import { z } from "zod";
import { analizar } from "@/lib/pipeline";
import { limiteLecturas } from "@/lib/limites";

export const maxDuration = 120;

const Contexto = z.object({
  historial: z.array(z.object({ proveedor: z.string().max(200), producto: z.string().max(200), fecha: z.string().max(10), precioUnit: z.number().finite(), unidad: z.string().max(20).nullable() })).max(2000).default([]),
  registrados: z.array(z.object({ docId: z.string().max(80), proveedor: z.string().max(200), numero: z.string().max(80).nullable(), fecha: z.string().max(10).nullable(), totalCents: z.number().int().nullable() })).max(2000).default([]),
  pedidos: z.array(z.object({ proveedor: z.string().max(200), producto: z.string().max(200), cantidad: z.number().finite(), unidad: z.string().max(20).nullable() })).max(500).default([]),
});

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const limite = await limiteLecturas(request);
  if (!limite.ok) return Response.json({ error: limite.motivo }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Formulario no válido" }, { status: 400 });
  }
  const files = form.getAll("fotos").filter((f): f is File => f instanceof File);
  if (!files.length || files.length > 3) return Response.json({ error: "Envía de 1 a 3 fotos" }, { status: 400 });
  let total = 0;
  for (const f of files) {
    if (!TIPOS.has(f.type)) return Response.json({ error: `Formato no admitido: ${f.type || "desconocido"}` }, { status: 400 });
    total += f.size;
  }
  if (total > MAX_BYTES) return Response.json({ error: "Las fotos pesan demasiado" }, { status: 413 });

  let ctx;
  try {
    const raw = form.get("contexto");
    ctx = Contexto.parse(typeof raw === "string" && raw ? JSON.parse(raw) : {});
  } catch {
    return Response.json({ error: "Contexto no válido" }, { status: 400 });
  }

  const fotos = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of analizar(fotos, ctx)) controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tipo: "error", codigo: "SERVIDOR", mensaje: (e as Error).message.slice(0, 200) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
