import { Suspense } from "react";
import { Sesion } from "@/components/Sesion";

const MUESTRAS: Record<string, { foto: string | null; instantaneo?: boolean }> = {
  encimera: { foto: "/muestras/encimera/escena-1200.webp" },
  mes: { foto: null, instantaneo: true },
  girado: { foto: "/muestras/girado/carnes-girado.jpg" },
};

// searchParams are request data: with Cache Components they must be read inside a Suspense boundary.
async function SesionDeLaUrl({ searchParams }: { searchParams: PageProps<"/sesion">["searchParams"] }) {
  const sp = await searchParams;
  const id = typeof sp.muestra === "string" && sp.muestra in MUESTRAS ? sp.muestra : "encimera";
  // The counter sample also exists read by Muse Spark Open (open weights, on Baseten): ?modelo=abierto.
  const abierto = id === "encimera" && sp.modelo === "abierto";
  return <Sesion muestra={id} replay={abierto ? "encimera-abierto" : id} modelo={id === "encimera" ? (abierto ? "abierto" : "spark") : undefined}
    foto={MUESTRAS[id].foto} instantaneo={MUESTRAS[id].instantaneo} />;
}

export default function Page({ searchParams }: PageProps<"/sesion">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<div className="mx-auto max-w-[1400px] px-4 py-6 font-serif text-2xl">Conforme</div>}>
        <SesionDeLaUrl searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
