import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { SCRIPT_IDIOMA } from "@/components/Idioma";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Conforme · Check it before you sign",
  description: "One photo of the morning's delivery notes. Conforme checks every euro, and an agent confirms each problem on the paper before it writes the claim to the supplier, with the proof attached.",
};

export const viewport: Viewport = { themeColor: "#f3efe6" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_IDIOMA }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
