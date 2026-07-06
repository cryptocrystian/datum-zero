import { handlers } from "@/auth";

// Auth.js v5 route handlers (magic-link email + database sessions). Node runtime (Prisma).
export const runtime = "nodejs";
export const { GET, POST } = handlers;
