# Architecture

## Pattern

Modular monolith inside a pnpm monorepo.

## Workspace Layout

- `apps/web` for the React user interface
- `apps/api` for the Fastify HTTP API
- `packages/config` for runtime configuration and logging helpers
- `packages/shared` for shared DTOs and validation contracts
- `packages/db` for Prisma schema, generated client, and database access helpers
- `docker/` for container images, entrypoints, and the Nginx reverse-proxy configuration
- `compose.yml` for the full local and deployment service topology
- `compose.production.yml` for the Yandex Cloud VM production topology
- `infra/yandex-cloud/` for infrastructure-as-code and bootstrap templates
- `scripts/deploy/` for registry, rollout, and smoke-check automation

## Backend Modules

- `apps/api/src/modules/auth` for registration, email verification, resend flows, login, logout, and session resolution
- `apps/api/src/modules/users` for authenticated user lists used by assignment flows
- `apps/api/src/modules/boards` for board CRUD, board members, board columns, archive state changes, and hard delete
- `apps/api/src/modules/tasks` for task CRUD, board-column moves, assignments, archive state changes, and hard delete
- `apps/api/src/modules/admin` for admin-only moderation overview, recovery actions, reassignment, and destructive actions

## Rules

- Frontend and backend may depend on `packages/shared` and `packages/config`.
- Database access is centralized in `packages/db`.
- HTTP route registration belongs in `apps/api/src/modules/*`.
- New modules should keep transport, service, and persistence concerns separated.
- Browser requests should target `/api` so Vite proxy and Nginx can share the same path contract.
- Auth verification tokens must be persisted only as hashes, never logged or stored in plaintext.
- Unverified accounts must stay in a pending state until verification is completed and must not receive a normal authenticated session.
- Production deployment targets Yandex Cloud using a Compute VM + managed PostgreSQL topology; local-only services must not leak into production compose.
- Database schema application must be explicit at runtime (`push`, `migrate-deploy`, or `none`) and production should prefer checked-in migrations.
- Reverse-proxy-aware cookie behavior must be controlled through env, not hardcoded to local assumptions.
- Board access must be derived from owner/admin rights plus board membership.
- Board workflow state must come from persisted board-scoped columns, not a shared global status enum.
- Archive and hard delete are both first-class flows: archive remains reversible, while hard delete must stay explicit and separately guarded.
