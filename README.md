# Scrumban

Scrumban is a TypeScript pnpm monorepo for a fullstack task management platform with a React frontend, Fastify backend, Prisma/PostgreSQL, real email verification, Docker-first deployment scaffolding, and a Yandex Cloud production deployment path.

## Workspace

- `apps/web` contains the React + Vite client, including auth, email verification screens, board management, board members, configurable kanban columns, assignee controls, and admin moderation UI.
- `apps/api` contains the Fastify API, signed cookie authentication, verification-aware auth flows, and working `users`, `boards`, `tasks`, and `admin` modules with membership-aware access control.
- `packages/config`, `packages/shared`, and `packages/db` hold shared runtime config, DTOs, moderation contracts, and Prisma access.
- `compose.yml`, `compose.production.yml`, `docker/`, `infra/yandex-cloud/`, and `scripts/deploy/` provide the local stack, production compose topology, Yandex Cloud infrastructure scaffold, and rollout automation.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Install dependencies with `pnpm install`.
3. Start local infrastructure with `docker compose up -d postgres mailpit`.
4. Generate Prisma client with `pnpm db:generate`.
5. Apply the database schema before first launch with `pnpm db:push`.
6. If you are upgrading from an older local schema and `db:push` reports non-executable changes, recreate the dev database with `pnpm db:reset`.
7. Optionally seed sample data with `pnpm db:seed`.
8. Start the development stack with `pnpm dev`.
9. Open Mailpit at `http://localhost:8025` to receive the verification email during local development.

The default Docker PostgreSQL port is `5433` to avoid collisions with a locally installed Postgres service on `5432`.

The frontend expects the API at `/api` and the Vite dev server proxies that path to `http://localhost:4000`.

Local development defaults the API mailer to Mailpit on `localhost:1025`. For a real provider, override `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` in `.env`.

Seed data includes:

- `admin@scrumbun.dev`
- `owner@scrumbun.dev`
- `member@scrumbun.dev`
- a sample `platform-ops` board
- default board columns and memberships
- active and archived sample tasks for moderation and delete flows

## Useful Commands

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:deploy`
- `pnpm db:push`
- `pnpm db:reset`
- `pnpm db:bootstrap`
- `pnpm db:seed`
- `docker compose up --build`
- `pnpm deploy:yc:build-push`
- `pnpm deploy:yc:rollout`
- `pnpm deploy:yc:smoke`
- `pnpm deploy:yc:render-host-nginx`

## Yandex Cloud Deployment

The first production deployment path targets:

- Compute Cloud VM for the app host
- Cloud Registry for Docker images
- Managed PostgreSQL for the database
- Cloud DNS for the public domain
- external SMTP for production email delivery

Production-specific artifacts:

- `.env.production.example`
- `compose.production.yml`
- `docs/deploy/yandex-cloud.md`
- `infra/yandex-cloud/`
- `scripts/deploy/`

The production compose stack intentionally excludes local-only services like `postgres` and `mailpit`.

For the step-by-step runbook, see:

- `docs/deploy/yandex-cloud.md`

## Notes

- The root `index.html` is a legacy prototype and remains in the repository while the new workspace takes shape.
- Registration now creates a pending account and sends a real verification email. Login is blocked until the verification link is consumed.
- Verification tokens are stored only as hashes, expire automatically, and are invalidated on resend or confirmation.
- The API now exposes `/api/health` and `/api/ready` for production smoke checks and reverse-proxy monitoring.
- Production runtime now supports secure cookie settings, reverse-proxy trust, managed PostgreSQL SSL options, and an explicit database apply strategy.
- `docker/api-entrypoint.sh` now supports `DATABASE_APPLY_STRATEGY=push|migrate-deploy|none` so production can use migrations instead of `db push`.
- Boards now use board-scoped columns instead of a global task-status enum.
- Board owners and admins can manage participants, columns, archive state, and permanent deletion.
- `pnpm db:reset` is intended only for local development. It force-resets the database schema and removes existing data.
- Docker image builds were not executed in this session because the local Docker daemon was unavailable, but `docker compose config` validates successfully.
