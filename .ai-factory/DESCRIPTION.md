# Project Description

## Summary

Scrumban is a fullstack task management application being built as a TypeScript monorepo with separate frontend, backend, shared package, and database layers.

## Tech Stack

- Language: TypeScript
- Package manager: pnpm workspaces
- Frontend: React + Vite
- Backend: Node.js + Fastify
- Database: PostgreSQL
- ORM: Prisma
- Validation: Zod
- Deployment: Docker Compose + Nginx on Ubuntu

## Current State

- `apps/api` now includes working `auth`, `users`, `boards`, `tasks`, and `admin` modules with route guards, repositories, services, membership-based authorization, real email verification over SMTP, and test coverage.
- `apps/web` now includes the React auth shell, verification-pending and verify-email screens, board workspace, board member management, configurable board columns, assignee controls, destructive delete flows, and an admin moderation screen.
- `packages/config`, `packages/shared`, and `packages/db` provide shared runtime config, contracts, and database access.
- `packages/shared/src/auth`, `packages/shared/src/tasks`, and `packages/shared/src/admin` now carry verification, board-scoped column, membership, delete, and moderation contracts used on both the API and frontend.
- `compose.yml`, `compose.production.yml`, `docker/api.Dockerfile`, `docker/web.Dockerfile`, `docker/nginx/default.conf`, `docker/nginx/host-proxy.conf.template`, `infra/yandex-cloud/`, and `scripts/deploy/` now provide both the local deployment baseline and the first Yandex Cloud production deployment path.
- `packages/db/prisma/seed.ts` now seeds an admin user, an owner user, a member user, a board, default columns, memberships, and sample tasks for manual verification.
- Root `index.html` remains as a legacy prototype during the migration.
