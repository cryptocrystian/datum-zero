/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The cockpit and the Infield Validator PWA both live in this app (MANIFEST §2).
  // Workspace packages are TS source; Next must transpile them.
  transpilePackages: ["@dz/db", "@dz/storage"],
};

export default nextConfig;
