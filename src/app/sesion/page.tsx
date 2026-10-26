import { Suspense } from "react";
import { Sesion } from "@/components/Sesion";

const MUESTRAS: Record<string, { foto: string }> = {
  encimera: { foto: "/muestras/encimera/escena.jpg" },
};

// searchParams are request data: with Cache Components they must be read inside a Suspense boundary.
async function SesionDeLaUrl({ searchParams }: { searchParams: PageProps<"/sesion">["searchParams"] }) {
  const sp = await searchParams;
  const id = typeof sp.muestra === "string" && sp.muestra in MUESTRAS ? sp.muestra : "encimera";
  return <Sesion muestra={id} foto={MUESTRAS[id].foto} />;
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
