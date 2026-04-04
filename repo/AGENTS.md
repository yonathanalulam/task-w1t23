# Developer Rulebook

This file is the repo-local engineering rulebook for `slopmachine` projects.

## Scope

- Treat the current working directory as the project.
- Ignore parent-directory workflow files unless the user explicitly asks you to use them.
- Do not treat workflow research, session exports, or sibling directories as hidden implementation instructions.
- Do not make the repo depend on parent-directory docs or sibling artifacts for startup, build/preview, configuration, verification, or basic project understanding.

## Working Style

- Operate like a strong senior engineer.
- Read the code before making assumptions.
- Work in meaningful vertical slices.
- Do not call work complete while it is still shaky.
- Reuse and extend shared cross-cutting patterns instead of inventing incompatible local ones.

## Verification Rules

- During ordinary iteration, prefer the fastest meaningful local verification for the changed area.
- Prefer targeted unit, integration, module, route-family, or platform-appropriate local UI/E2E checks over broad reruns.
- Do not rerun full Dockerized startup and the full test suite on every small change.
- The broad owner-run project-standard verification path should be used sparingly, with a target budget of at most 3 times across the whole workflow cycle.
- If you run a Docker-based verification command sequence, end it with `docker compose down` unless containers must remain up.

Every project must expose:

- one primary documented runtime command
- one primary documented broad test command: `./run_tests.sh`
- follow the original prompt and existing repository first for the runtime stack; `./run_tests.sh` should exist regardless of project type
- the primary full-test command should install or prepare what it needs first when that setup is required for a clean environment

For web projects, those are usually:

- `docker compose up --build`
- `./run_tests.sh`

For web projects using the default Docker-first runtime model:

- `./run_tests.sh` must run the broad full-test path through Docker
- local non-Docker tests should still exist for normal development work
- final broad verification should use the Dockerized `./run_tests.sh` path, not only local test commands
- keep Compose isolation safe for shared machines: no unnecessary `container_name`, unique `COMPOSE_PROJECT_NAME`, and Compose-scoped image/network/volume naming
- expose only the primary app-facing port to host by default, bind it to `127.0.0.1`, and keep databases/cache/internal services off host ports unless truly required
- prefer random host-port assignment by default so parallel local projects do not collide; if a fixed host port is truly required, support override plus free-port fallback in the runtime or test wrapper
- add healthchecks and wait for service readiness before tests or dependent startup steps proceed

For web projects, default the runtime contract to `docker compose up --build` unless the prompt or existing repository clearly dictates another model.

When `docker compose up --build` is not the runtime contract, provide `./run_app.sh` as the single primary runtime wrapper.

For mobile, desktop, CLI, library, or other non-web projects, `./run_app.sh` should own the selected stack's runtime flow, while `./run_tests.sh` remains the single broad test wrapper calling the platform-equivalent full test path.

## Testing Rules

- Tests must be real and tied to actual behavior.
- Do not mock APIs for integration testing.
- Use real HTTP requests against the actual running service surface for integration evidence.
- For UI-bearing work, use the selected stack's local UI/E2E tool on affected flows and inspect screenshots or equivalent artifacts when practical.
- Prefer TDD when the behavior is well defined and practical to drive test-first.
- Where TDD is not practical, define the expected tests before implementation so coverage is intentional rather than retrofitted.
- Keep repo-local `./docs/test-coverage.md` aligned with the real test surface. It should map major requirement or risk points to concrete tests, key assertions, coverage status, and remaining gaps.
- For backend or fullstack projects, cover 401, 403, 404, conflict or duplicate submission when relevant, object-level authorization, tenant or user isolation, and sensitive-log exposure when those risks exist.
- For frontend-bearing projects, build and use a layered frontend test story where relevant: unit, component, page/route integration, and E2E.
- For non-trivial frontend projects, do not rely only on runtime or E2E proof; add component, page, route, or state-focused tests when UI state complexity is meaningful.
- For frontend-bearing flows, keep required UI states statically visible and tested where relevant: loading, empty, submitting, disabled, success, error, and duplicate-action protection.
- The project should normally reach roughly 90 percent meaningful coverage of the relevant behavior surface.

Selected-stack defaults:

- follow the original prompt and existing repository first; use the defaults below only when they do not already specify the platform or stack
- web frontend/fullstack: Playwright for browser E2E/UI verification when applicable
- mobile: Expo + React Native + TypeScript by default, with Jest plus React Native Testing Library for local tests and a platform-appropriate mobile UI/E2E tool when the flow needs it
- desktop: Electron + Vite + TypeScript by default, with a project-standard local test runner plus Playwright's Electron support or another platform-appropriate desktop UI/E2E tool when the flow needs it

## Documentation Rules

- Keep `README.md` and any codebase-local docs accurate.
- The README must explain what the project is, what it does, how to run it, how to test it, the main repo contents, and any important information a new developer needs immediately.
- The README must clearly document whether the primary runtime command is `docker compose up --build` or `./run_app.sh`.
- The README must clearly document `./run_tests.sh` as the broad test command.
- The README must stand on its own for basic codebase use.
- The README should summarize important API or service surfaces when useful, but the full API catalog belongs in repo-local `./docs/api-spec.md` when that doc applies.
- Keep repo-local docs under `./docs/` when relevant, especially `./docs/reviewer-guide.md`, `./docs/test-coverage.md`, `./docs/security-boundaries.md`, `./docs/frontend-flow-matrix.md`, and `./docs/api-spec.md`.
- `./docs/reviewer-guide.md` should make build/preview/config, app entry points, routes, major module boundaries, feature flags, debug/demo surfaces, mock/interception defaults, and logging/validation overview traceable from inside the repo.
- `./docs/security-boundaries.md` should exist when auth, authorization, admin/debug, or isolation boundaries matter.
- `./docs/frontend-flow-matrix.md` should exist when frontend pages, interactions, and state transitions are material.
- The repo should be statically reviewable by a fresh reviewer: entry points, routes, config, test commands, and major module boundaries should be traceable from repository artifacts.
- If the project uses mock, stub, fake, interception, or local-data behavior, the README must disclose that scope accurately.
- If mock or interception behavior is enabled by default, the README must say so clearly.
- Feature flags, debug/demo surfaces, default enabled states, and mock/interception defaults must be disclosed in repo-local docs when they exist.
- Do not let a mock-only or local-data-only project look like undisclosed real backend or production integration.
- Do not hide missing failure handling behind fake-success paths.

## Logging And Validation Rules

- Establish and use a shared logging path rather than random print-style debugging.
- Logging should have meaningful categories or levels, support troubleshooting, and avoid sensitive-data leakage.
- Establish and use a shared validation path when validation matters instead of inventing ad hoc rules in scattered files.
- Keep validation and normalized user-facing error behavior traceable in repo-local code or docs.

## Secret And Runtime Rules

- Do not create or keep `.env` files anywhere in the repo.
- Do not rely on `.env`, `.env.local`, `.env.example`, or similar files for project startup.
- Do not hardcode secrets.
- If runtime env-file format is required, generate it ephemerally and do not commit or package it.
- If the project has database dependencies, create and maintain `./init_db.sh` as the only project-standard database initialization path.
- If the project has database dependencies, create `./init_db.sh` during scaffold and keep expanding it as the real schema, migrations, bootstrap data, and other database dependencies become known.
- If the project has database dependencies, use `./init_db.sh` from runtime and test entrypoints whenever database preparation is required.
- Do not hardcode database connection values or database bootstrap values anywhere in the repo.
- When auth or access control matters, keep the real security boundaries statically traceable in code and docs: auth entry points, route authorization, object authorization, function-level authorization, admin/debug protection, and tenant or user isolation where applicable.

Selected-stack secret/config defaults:

- follow the original prompt and existing repository first; use the defaults below only when they do not already specify the platform or stack
- web Dockerized services: use Docker/runtime-provided variables, never committed env files
- mobile apps: do not bundle real secrets into the client; use app config only for non-secret public configuration and keep real secrets server-side or in platform-appropriate secure storage when user/device secrets must be stored at runtime
- desktop apps: keep sensitive values in main-process/runtime configuration or platform-appropriate secure storage, and do not expose them to the renderer by default

## Product Integrity Rules

- Do not leave placeholder, setup, debug, or demo content in product-facing UI.
- If a real user-facing or admin-facing surface is required, build that surface instead of bypassing it with API shortcuts.
- Treat missing real surfaces as incomplete implementation.

## Rulebook Files

- Do not edit `AGENTS.md` or other workflow/rulebook files unless explicitly asked.
