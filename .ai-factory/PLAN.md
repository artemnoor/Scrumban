# Plan: Prepare Production Deployment for Yandex Cloud

Created: 2026-03-31
Branch: `main`
Mode: `fast`

## Settings

- Testing: `yes`
- Logging: `verbose`
- Docs: `yes`

## Scope

Prepare Scrumbun for production deployment on Yandex Cloud after reviewing the current official documentation and aligning the deployment path with the existing stack:

- React + Vite frontend
- Fastify API
- Prisma + PostgreSQL
- Docker-based runtime
- Nginx edge layer
- SMTP-based email verification

The goal is not “generic cloud readiness”, but a concrete Yandex Cloud deployment path that this repository can actually ship with.

## Documentation Inputs

Official documentation reviewed before planning:

- Compute Cloud: creating a Linux VM  
  `https://yandex.cloud/en/docs/compute/quickstart/quick-create-linux`
- Cloud Registry: Docker authentication and image push  
  `https://yandex.cloud/en/docs/cloud-registry/operations/docker/authentication`  
  `https://yandex.cloud/en/docs/cloud-registry/operations/docker/push`
- Managed Service for PostgreSQL: quick start, networking, and connection rules  
  `https://yandex.cloud/en/docs/managed-postgresql/quickstart`  
  `https://yandex.cloud/en/docs/managed-postgresql/concepts/network`  
  `https://yandex.cloud/en/docs/managed-postgresql/operations/connect`
- Cloud DNS quick start  
  `https://yandex.cloud/en/docs/dns/quickstart`
- Certificate Manager overview  
  `https://yandex.cloud/en/docs/certificate-manager/`

## Chosen Deployment Direction

Use the following production topology for the first Yandex Cloud deployment:

- `Yandex Compute Cloud VM` as the application host
- `Yandex Cloud Registry` for Docker image storage
- `Managed Service for PostgreSQL` for the production database
- `Cloud DNS` for domain records
- `External SMTP provider` for email delivery
- `TLS termination on the VM / deployment host` for the first iteration

## Why This Topology

- The current repository already ships a Docker + Nginx deployment baseline, so a Compute Cloud VM is the shortest path to a real production rollout.
- The PostgreSQL documentation explicitly supports connecting from a VM in the same cloud network, which lets us keep the database private instead of exposing it to the internet.
- Current Yandex documentation positions Cloud Registry as the official artifact store for Docker images, so image delivery should be aligned to that service.
- Cloud DNS cleanly covers the public domain side for a VM-backed deployment.
- Certificate Manager documentation lists integrations such as websites, API Gateway, Cloud CDN, and Application Load Balancer.  
  Inference: for a raw Nginx app running directly on a Compute VM, the first practical path is host-level / VM-level TLS rather than trying to use Certificate Manager directly with the VM.

## Assumptions

- Because the current worktree is dirty, the plan should stay in `fast` mode and avoid branch creation.
- The first production release should prefer operational simplicity over a more complex ALB-based setup.
- The production database should move out of local Docker Compose and into Managed PostgreSQL.
- The production deployment should not include `mailpit` or the local `postgres` container.
- The deployment should keep uploads persisted outside ephemeral container layers.
- The deployment path should remain compatible with later improvements such as ALB + Certificate Manager or object storage-backed uploads.

## Architecture Notes

- Keep runtime code changes within the existing modular monolith boundaries.
- Treat infrastructure as code where practical, with Yandex Cloud-specific artifacts isolated under a dedicated infra directory.
- Keep browser requests on `/api` so the same path contract works both locally and in production.
- Keep the database private inside the Yandex Cloud network when using a Compute VM in the same VPC.
- Add production secrets and TLS material through env files, secret stores, or deployment-time provisioning, never through committed plaintext files.

## Tasks

- [x] Task 1: Define and codify the Yandex Cloud production topology in repo-facing deployment docs.
  Files: `README.md`, new `docs/deploy/yandex-cloud.md`, `AGENTS.md`, and `.ai-factory/DESCRIPTION.md` if the production target description needs refinement.
  Deliverable: document the chosen deployment route as `Compute VM + Cloud Registry + Managed PostgreSQL + Cloud DNS + external SMTP`, explain why this path was selected from the reviewed docs, and explicitly separate first-release scope from later optional upgrades such as ALB or object storage.
  Logging: add operator-facing guidance for where deployment logs live, what startup logs should confirm, and which warnings should be treated as blockers before cutover.

- [x] Task 2: Introduce production-specific environment contracts and secure runtime defaults.
  Files: `.env.example`, new `.env.production.example`, `apps/api/src/shared/config/env.ts`, `apps/web/index.html` if origin/runtime assumptions need updates, and any auth/session config files touched by secure deployment.
  Deliverable: define production-safe env variables for domain, API origin, secure cookies, SMTP, uploads, Cloud PostgreSQL, and deployment metadata; ensure local defaults remain ergonomic while production defaults force explicit configuration.
  Logging: log resolved runtime mode, effective public origin, proxy-aware cookie mode, and env validation failures without printing secrets or raw credentials.

- [x] Task 3: Add Managed PostgreSQL compatibility for Yandex Cloud networking and SSL requirements.
  Files: `packages/db/*`, `apps/api/src/*` where database startup is configured, `docker/api-entrypoint.sh`, and any Prisma/runtime config helpers needed.
  Deliverable: support a production `DATABASE_URL` / connection strategy that works with Managed PostgreSQL, including the SSL certificate path or related runtime configuration expected by Yandex Cloud when applicable, plus a reliable migration flow for startup and rollouts.
  Logging: log DB host mode (`local` vs `managed`), migration start/end, certificate path presence, and connection failures with hostnames redacted only where necessary for safety.

- [x] Task 4: Split local Compose and production Compose into clear, deployment-safe topologies.
  Files: `compose.yml`, new `compose.production.yml`, `.dockerignore`, `docker/api.Dockerfile`, `docker/web.Dockerfile`, and any supporting runtime scripts.
  Deliverable: keep local services for development, while production compose runs only the app containers and persistent app volumes; remove local-only dependencies from the production path, add healthchecks where needed, and make the production stack consumable on a Yandex Cloud VM without manual patching.
  Logging: add clear container startup logs for API, Nginx/web, migration execution, and healthcheck failures to simplify first-boot diagnosis on the VM.

- [x] Task 5: Prepare Nginx and edge behavior for real domain traffic, reverse proxying, and HTTPS deployment.
  Files: `docker/nginx/default.conf`, any new Nginx production config files under `docker/nginx/`, and docs under `docs/deploy/`.
  Deliverable: define the production Nginx setup for a real domain, proper forwarded headers, SPA routing, `/api` proxying, upload limits, and HTTPS integration strategy on the VM; make it explicit whether TLS lives in the containerized Nginx or in a host-level proxy.
  Logging: configure access/error logging recommendations, forwarded-header expectations, and troubleshooting notes for `502`, bad origin, and cookie security mismatches.

- [x] Task 6: Add infrastructure-as-code scaffolding for the Yandex Cloud resources this deployment needs.
  Files: new `infra/yandex-cloud/` directory with Terraform or equivalent IaC files such as `main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`, and supporting templates such as `cloud-init.yaml`.
  Deliverable: define the baseline Yandex Cloud resources required for the chosen topology: network/subnet, security groups, Compute VM, Cloud Registry, Managed PostgreSQL cluster, and optional DNS zone records where automation is practical.
  Logging: document infrastructure outputs that operators must capture, such as VM IP, DB FQDN, registry ID, and security group IDs, and note which values should never be echoed in CI logs.

- [x] Task 7: Add deployment automation for building, tagging, pushing, and rolling out images through Yandex Cloud Registry.
  Files: `package.json`, new scripts under `scripts/deploy/` or `scripts/yandex-cloud/`, and CI config if deployment automation is wired into the repo.
  Deliverable: provide a repeatable workflow for Docker build, Cloud Registry authentication, image tagging in the `registry.yandexcloud.net/<registry_ID>/<image>:<tag>` format, image push, and remote VM update. The flow should support both manual operator runs and future CI integration.
  Logging: log image tags, target registry IDs, deployment step boundaries, and remote command phases without exposing auth tokens, SSH private keys, or SMTP secrets.

- [x] Task 8: Add Yandex Cloud VM bootstrap and post-provisioning scripts.
  Files: new `infra/yandex-cloud/cloud-init.*`, `scripts/deploy/*`, and deployment docs.
  Deliverable: bootstrap the VM with Docker, Docker Compose support, app directories, env file locations, optional firewall setup, CA cert handling for Managed PostgreSQL, and a deterministic rollout sequence for first install and subsequent updates.
  Logging: emit step-by-step bootstrap logs for package install, Docker availability, compose launch, migration execution, and final service readiness checks.

- [x] Task 9: Add production verification checks and smoke-test coverage for the Yandex Cloud deployment path.
  Files: deployment docs, CI or script files, and any targeted verification helpers created under `scripts/`.
  Deliverable: define and, where feasible, automate the critical checks for production rollout: container health, DB connectivity, `/api/health` or equivalent readiness endpoint if needed, static web delivery, auth cookie behavior behind the proxy, SMTP configuration sanity, and register -> verify -> login smoke flow.
  Logging: require explicit verification logs for health probes, migration state, DB connectivity checks, and application URL probes so failed deploys are diagnosable without SSH archaeology.

- [x] Task 10: Write the final operator runbook for first deployment and rollback on Yandex Cloud.
  Files: `docs/deploy/yandex-cloud.md`, `README.md`, and any command/reference files added during the implementation.
  Deliverable: produce a runbook covering prerequisites, required IAM roles, domain and DNS setup, registry auth, infrastructure apply, env/secrets placement, first deploy, updates, backups, rollback, and post-deploy smoke checks. Include a short section for “what is still manual” if the first version is not fully automated.
  Logging: document which log files, `docker compose logs`, cloud-console states, and DB/network signals operators should inspect during deploy, rollback, and incident response.

## Commit Plan

- Checkpoint 1 after Tasks 1-3
  Suggested commit: `chore(deploy): define yandex cloud production env and topology`

- Checkpoint 2 after Tasks 4-6
  Suggested commit: `feat(deploy): add production compose nginx and yandex cloud infra scaffolding`

- Checkpoint 3 after Tasks 7-8
  Suggested commit: `feat(deploy): add yandex cloud build push and vm bootstrap automation`

- Final checkpoint after Tasks 9-10
  Suggested commit: `docs(deploy): add yandex cloud rollout verification and runbook`
