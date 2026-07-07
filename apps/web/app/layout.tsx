import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Design system: Inter (interface) + JetBrains Mono (all data), self-hosted via next/font.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Datum Zero — Cockpit",
  description: "Back-office cockpit for Autonomous Reality Ledger Reconciliation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. ColorZilla's cz-shortcut-listen) inject
    // attributes onto <html>/<body> before hydration. This suppresses ONLY attribute/text warnings
    // on these two top-level tags — it does not mask real hydration mismatches in child components.
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-datum-midnight text-white antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
