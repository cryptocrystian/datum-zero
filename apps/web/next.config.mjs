import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for a slim, non-root container (M2-6a). Traces only the files the
  // server actually uses; `outputFileTracingRoot` points at the monorepo root so the workspace
  // packages (@dz/*) are traced into .next/standalone.
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  // The cockpit and the Infield Validator PWA both live in this app (MANIFEST §2).
  // Workspace packages are TS source; Next must transpile them.
  transpilePackages: ["@dz/db", "@dz/storage", "@dz/adapters"],
  // BullMQ/ioredis are server-only Node deps used by the outbox; keep them external on the server.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
