# AGENTS.md

## Project Overview

Scrumban is a fullstack task management application with a React frontend, Fastify backend, PostgreSQL database, cookie-based authentication, real email verification, admin tooling, file uploads, and Docker-first deployment targets.

## Current Project Structure

```text
.
|-- .ai-factory/
|   |-- ARCHITECTURE.md
|   |-- DESCRIPTION.md
|   `-- PLAN.md
|-- apps/
|   |-- api/
|   `-- web/
|-- docs/
|   `-- deploy/
|-- docker/
|   |-- nginx/
|   |   `-- default.conf
|   |-- api-entrypoint.sh
|   |-- api.Dockerfile
|   `-- host-proxy.conf.template
|-- infra/
|   `-- yandex-cloud/
|   `-- web.Dockerfile
|-- scripts/
|   `-- deploy/
|-- packages/
|   |-- config/
|   |-- db/
|   `-- shared/
|-- .env.example
|-- .dockerignore
|-- .gitignore
|-- AGENTS.md
|-- README.md
|-- compose.production.yml
|-- compose.yml
|-- index.html
|-- package.json
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `apps/web/src/App.tsx` | Frontend app bootstrap with router and auth provider |
| `apps/web/src/modules/auth/auth-context.tsx` | Session state, auth actions, verification state, and route-level auth wiring |
| `apps/web/src/modules/auth/email-verification-page.tsx` | Verification pending screen, resend flow, and token confirmation UX |
| `apps/web/src/modules/dashboard/dashboard-page.tsx` | Main board workspace with board members, dynamic columns, task management, and destructive actions |
| `apps/web/src/modules/admin/admin-page.tsx` | Admin moderation screen for archived boards/tasks, reassignment, and recovery/delete actions |
| `apps/api/src/main.ts` | Backend server startup |
| `apps/api/src/app.ts` | Fastify app factory and route registration |
| `apps/api/src/modules/auth/index.ts` | Auth endpoints for register, login, resend verification, verify email, logout, and session resolution |
| `apps/api/src/modules/auth/mail/auth-mailer.ts` | SMTP-backed verification email delivery |
| `docker/api-entrypoint.sh` | Runtime bootstrap for Prisma schema application and API startup |
| `compose.production.yml` | Production container topology for Yandex Cloud VM deployment |
| `docs/deploy/yandex-cloud.md` | Detailed Russian runbook for Yandex Cloud deployment, REG.RU DNS, TLS, rollout, and troubleshooting |
| `infra/yandex-cloud/*` | Infrastructure-as-code scaffold for network, VM, PostgreSQL, and DNS |
| `scripts/deploy/*` | Build/push, rollout, host proxy rendering, and smoke-check automation |
| `apps/api/src/modules/boards/index.ts` | Board endpoints for membership, column configuration, archive, and delete flows |
| `apps/api/src/modules/tasks/index.ts` | Task endpoints for CRUD, column moves, assignments, archive, and delete actions |
| `apps/api/src/modules/admin/index.ts` | Admin-only moderation endpoints for overview, recovery, reassignment, and hard delete |
| `packages/db/prisma/schema.prisma` | Database schema |
| `packages/db/prisma/seed.ts` | Sample board/task/admin seed data for manual verification |
| `compose.yml` | Multi-service topology for PostgreSQL, Mailpit, API, and Nginx-served web app |
| `docker/nginx/default.conf` | Reverse proxy and SPA routing configuration |
| `.ai-factory/PLAN.md` | Active implementation checklist |
| `index.html` | Legacy prototype kept during migration |
