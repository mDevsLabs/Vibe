# Vibe — Base44 Dev Environment

## Architecture

This is a **frontend-only dev setup**. The repo contains both a React/Vite frontend (`src/`) and a Hono backend (root-level `.ts` files like `main.ts`, `auth.ts`, `config.ts`), but the backend is deployed on Val Town at `https://mai.val.run` and is **not run locally**.

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS 4, served on port 3000.
- **Backend**: Hono on Deno/Val Town (`https://mai.val.run`). Uses Neon Postgres serverless, JWT auth, OpenRouter LLM, You.com search, DeepL translation, S3 storage, Gmail email.
- The Vite dev server proxies API routes (`/api`, `/v1`, `/vibe`, `/login`, etc.) to `https://mai.val.run` when running on localhost.
- When running on the preview host (non-localhost), the frontend's `API_BASE` resolves to `https://mai.val.run` directly (cross-origin, backend CORS is `*`).

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

Single `web` service: `node:22-slim`, bind-mounted source, `npm install && npm run dev`.

## Secrets

None required for the frontend. All backend credentials (DATABASE_URL, API keys, JWT secret, S3, Gmail, etc.) live on the Val Town deployment, not in this repo.

## Key files

- `vite.config.ts` — Vite config with proxy to production backend; `host: true` + `allowedHosts: true` for preview.
- `src/services/api.ts` — API client; `API_BASE` logic selects production backend for non-localhost.
- `src/App.tsx` — Root layout, routing, modals.
- `lib/db/migrations/` — SQL migrations (run against Neon, not needed locally).

## Verification

- `curl http://localhost:3000/` returns the Vite-served HTML with `/@vite/client` (confirms dev server, not prebuilt).
- The production backend at `https://mai.val.run` responds (e.g. `GET /v1/me` → 401 without auth).
