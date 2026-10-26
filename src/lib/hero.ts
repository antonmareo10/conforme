// The landing hero photo in three widths: phones take the small ones. Shared by the preload in
// page.tsx (server) and the <img> in HeroDemo (client), so both ask for the same file.
export const HERO_SRCSET = "/muestras/encimera/escena-640.webp 640w, /muestras/encimera/escena-900.webp 900w, /muestras/encimera/escena-1200.webp 1200w";
export const HERO_SIZES = "(min-width: 1024px) 540px, calc(100vw - 32px)";
