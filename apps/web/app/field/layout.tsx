import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { RegisterSW } from "./RegisterSW";

// Infield Validator PWA surface (M1-04, CR-11) — separate from the cockpit, same Next.js app
// (MANIFEST §2). Installable + offline-capable; the manifest link + theme color are scoped here.
export const metadata: Metadata = {
  title: "Infield Validator — Datum Zero",
  description: "On-site data-integrity and hardware screening for field capture sets.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DZ Infield" },
};

export const viewport: Viewport = {
  themeColor: "#121926",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// AUTHORITATIVE auth gate (CR-20): a pilot must be signed in; the tenant org derives from the
// session and any future tenant query runs RLS-scoped (M1-02). No self-serve access (CR-14).
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin?callbackUrl=/field");

  return (
    <div className="min-h-[100dvh] bg-datum-darknavy text-white">
      <RegisterSW />
      {children}
    </div>
  );
}
