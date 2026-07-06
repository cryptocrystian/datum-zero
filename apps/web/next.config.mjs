/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The cockpit and the Infield Validator PWA both live in this app (MANIFEST §2).
  // Workspace packages are TS source; Next must transpile them.
  transpilePackages: ["@dz/db", "@dz/storage", "@dz/adapters"],
  // BullMQ/ioredis are server-only Node deps used by the outbox; keep them external on the server.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
