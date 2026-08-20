import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintPilot Hi — Assistant de réglages 3D",
  description: "Analyse un STL, gère ton inventaire et recommande les profils, réglages et supports pour la Creality Hi.",
  openGraph: { title: "PrintPilot Hi", description: "Le bon profil. Les bons supports. Avant d’imprimer.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
