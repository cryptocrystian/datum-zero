# Datum Zero — developer entry points (M2-8). Full docs: docs/SANDBOX.md
.PHONY: sandbox sandbox-demo reset

## sandbox: one command — seed + run web + inference + workers locally (no Docker, no AWS)
sandbox:
	@pnpm sandbox

## sandbox-demo: drive a real capture end-to-end through the running sandbox
sandbox-demo:
	@pnpm sandbox:demo

## reset: drop + re-migrate + reseed the local database
reset:
	@pnpm db:reset
