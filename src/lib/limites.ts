// Rate limits for live reads: per IP per hour, and a global daily cap so credits cannot run out
// during judging (the app then falls back to recorded samples). Upstash Redis REST when configured,
// in-memory otherwise (local development).

const POR_IP_HORA = Number(process.env.LIVE_READS_PER_IP_HOUR ?? 10);
const POR_DIA = Number(process.env.LIVE_READS_PER_DAY ?? 300);

const memoria = new Map<string, { n: number; expira: number }>();

async function incr(clave: string, ttlSeg: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", clave], ["EXPIRE", clave, String(ttlSeg), "NX"]]),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`rate limiter ${r.status}`);
    const [first] = (await r.json()) as { result: number }[];
    return first.result;
  }
  const ahora = Date.now();
  const v = memoria.get(clave);
  if (!v || v.expira < ahora) {
    memoria.set(clave, { n: 1, expira: ahora + ttlSeg * 1000 });
    return 1;
  }
  v.n++;
  return v.n;
}

export function ipDe(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}

export async function limiteLecturas(request: Request): Promise<{ ok: true } | { ok: false; motivo: "TOPE_IP" | "TOPE_DIARIO" | "SIN_DIRECTO" }> {
  if (process.env.LIVE_DISABLED === "1") return { ok: false, motivo: "SIN_DIRECTO" };
  const hora = Math.floor(Date.now() / 3_600_000);
  const dia = new Date().toISOString().slice(0, 10);
  try {
    if ((await incr(`conforme:dia:${dia}`, 2 * 86_400)) > POR_DIA) return { ok: false, motivo: "TOPE_DIARIO" };
    if ((await incr(`conforme:ip:${ipDe(request)}:${hora}`, 3_600)) > POR_IP_HORA) return { ok: false, motivo: "TOPE_IP" };
  } catch {
    // If the limiter is down, stay safe: no live reads, recorded samples still work.
    return { ok: false, motivo: "SIN_DIRECTO" };
  }
  return { ok: true };
}
