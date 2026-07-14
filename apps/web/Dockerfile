# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js cockpit/PWA (`web`) and the BullMQ outbox worker (`workers`).
# Both share one monorepo build. Secrets are provided at RUNTIME (env / Secrets Manager), never baked
# into a layer (M2-6a, CR-35). Runtimes run NON-ROOT.
ARG NODE_VERSION=22-bookworm-slim

# ---- deps: install the pnpm workspace, cached on the manifests ----
FROM node:${NODE_VERSION} AS deps
# COREPACK_HOME is a SHARED, world-readable location so the pinned pnpm is available to the non-root
# runtime user without corepack trying to download it into a (non-writable) $HOME at container start.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && chmod -R a+rX /opt/corepack
# openssl (libssl) so Prisma detects OpenSSL 3 + generates/loads the debian-openssl-3.0.x query engine
# in the build (→ workers, which is FROM build). Without it Prisma defaults to the absent 1.1.x engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/adapters/package.json packages/adapters/
COPY packages/storage/package.json packages/storage/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build: generate the Prisma client, then the Next standalone bundle ----
FROM deps AS build
WORKDIR /repo
COPY . .
RUN pnpm --filter @dz/db exec prisma generate
RUN pnpm --filter @dz/web build
# Next's standalone file-tracing does not copy the Prisma query-engine .node binary in a pnpm monorepo,
# so stage it at a fixed path for the web runtime to load explicitly (M2-7c).
RUN cp "$(find /repo/node_modules -name 'libquery_engine-debian-openssl-3.0.x.so.node' | head -1)" /repo/query-engine.so.node

# ---- web: minimal standalone runtime, non-root ----
FROM node:${NODE_VERSION} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# openssl so the traced Prisma query engine (debian-openssl-3.0.x) loads at runtime (M2-7c).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone traces its own node_modules + the @dz/* workspace packages; no dev deps, no secrets.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
# The Prisma query engine (missed by Next's standalone tracing) — pointed at explicitly (M2-7c).
COPY --from=build --chown=nextjs:nodejs /repo/query-engine.so.node /app/query-engine.so.node
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/query-engine.so.node
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ---- workers: the BullMQ outbox delivery worker, non-root ----
# Shares the monorepo build (it needs tsx + the TS source + the generated Prisma client). DATABASE_URL
# (the non-superuser datumzero_app role), REDIS_URL, and any secrets come from the runtime env — never
# baked. worker-main.ts best-effort-loads .env* which are dockerignored, so it falls back to the env.
FROM build AS workers
ENV NODE_ENV=production
WORKDIR /repo
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --create-home worker
USER worker
CMD ["pnpm", "--filter", "@dz/db", "exec", "tsx", "../../apps/web/lib/outbox/worker-main.ts"]
