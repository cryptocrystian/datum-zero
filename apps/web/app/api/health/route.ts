import { NextResponse } from "next/server";

// Liveness probe for the web/cockpit tier.
export function GET() {
  return NextResponse.json({ status: "ok", service: "web", ts: new Date().toISOString() });
}
