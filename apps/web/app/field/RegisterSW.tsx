"use client";

import { useEffect } from "react";

/**
 * Registers the Infield Validator service worker (M1-04). The SW lives at /sw.js (root scope) so it
 * can serve the offline shell for any /field navigation. Best-effort — a failed registration never
 * breaks the page; the field surface just loses offline capability.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
