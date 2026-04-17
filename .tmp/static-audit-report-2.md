# Static Delivery Acceptance & Architecture Audit (RRGA)

Date: 2026-04-05
Mode: static-only (no runtime execution)

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: the implementation is broad and production-shaped across API/web/migrations/security/test surfaces, with no clear static Blocker/High defect confirmed in current code; remaining concerns are mainly assignment-model robustness and test depth realism.

## 2. Scope and Static Verification Boundary
- Reviewed statically: docs/scripts/config, API modules/routes/services/repositories, DB migrations, web role routes/hooks/server endpoints, API/web tests.
- Not executed: app startup, Docker, tests, browser flows, migrations, load/concurrency exercises.
- Manual verification required for: runtime UX correctness, cross-service behavior under load, and operational deployment controls.

## 3. Repository / Requirement Mapping Summary
- Monorepo shape and module wiring are complete (`apps/api/src/modules/index.ts:29`, `apps/api/src/modules/index.ts:124`, `apps/web/src/hooks.server.ts:6`).
- Core prompt slices are present: auth/RBAC, researcher submissions/doc versioning, workflow review/approval, journal governance, resource booking, recommendations, finance reconciliation (`README.md:10`, `README.md:31`, `README.md:55`).
- DB model evolution covers all slices through migrations (`apps/api/migrations/0003_researcher_submissions.sql:1`, `apps/api/migrations/0008_finance.sql:11`, `apps/api/migrations/0010_finance_ledger_immutability.sql:1`).

## 4. Section-by-section Review

### 4.1 Hard Gates
- 1.1 Documentation and static verifiability: **Pass**.
  - Evidence: run/test instructions and route inventory are present (`README.md:117`, `README.md:195`, `run_tests.sh:19`), and API module registration aligns (`apps/api/src/modules/index.ts:124`).
- 1.2 Material deviation from prompt: **Pass**.
  - Evidence: policy/submission/workflow/journal/booking/recommendation/finance slices are all implemented in registered modules and routes (`apps/api/src/modules/index.ts:124`, `README.md:31`, `README.md:55`).

### 4.2 Delivery Completeness
- 2.1 Core explicit requirements: **Pass** (static).
  - Evidence: password policy + lockout (`apps/api/src/modules/auth/password-policy.ts:1`, `apps/api/src/modules/auth/service.ts:159`), secure upload controls (`apps/api/src/lib/upload-security.ts:223`), document versioning/rollback cap (`apps/api/src/modules/researcher/rules.ts:3`), booking constraints (`apps/api/src/modules/resource-booking/service.ts:340`), finance reconciliation/exception flow (`apps/api/src/modules/finance/routes.ts:199`, `apps/api/src/modules/finance/routes.ts:237`).
- 2.2 End-to-end deliverable shape: **Pass**.
  - Evidence: API + web + migrations + tests + scripts are present (`README.md:9`, `apps/api/src/app.ts:30`, `apps/web/src/routes/+layout.svelte:16`).

### 4.3 Engineering and Architecture Quality
- 3.1 Structure/decomposition: **Pass**.
  - Evidence: clear module boundaries and service/repository layering (`apps/api/src/modules/index.ts:29`, `apps/api/src/modules/researcher/service.ts:23`, `apps/api/src/modules/workflow/repository.ts:162`).
- 3.2 Maintainability/extensibility: **Partial Pass**.
  - Evidence: workflow assignment is computed dynamically from current role roster (`apps/api/src/modules/workflow/repository.ts:35`, `apps/api/src/modules/workflow/repository.ts:53`) rather than persisted as explicit assignment records; this can cause assignment drift when roster membership changes.

### 4.4 Engineering Details and Professionalism
- 4.1 Error handling/logging/validation/API design: **Pass**.
  - Evidence: uniform error envelope (`apps/api/src/plugins/error-envelope.ts:24`), structured redaction (`apps/api/src/lib/logger.ts:7`), route schema validation examples (`apps/api/src/modules/auth/routes.ts:26`, `apps/api/src/modules/finance/routes.ts:41`).
- 4.2 Product realism vs demo: **Pass**.
  - Evidence: role-specific surfaces and business workflows are non-trivial (`apps/web/src/routes/(researcher)/researcher/+page.svelte:8`, `apps/web/src/routes/(finance)/finance/+page.svelte:8`).

### 4.5 Prompt Understanding and Requirement Fit
- 5.1 Business-goal fit: **Partial Pass**.
  - Evidence: features align strongly, but some documentation/UI messaging lags current scope (home page omits booking/recommendations/finance while implemented) (`apps/web/src/routes/+page.svelte:2`, `README.md:10`).

### 4.6 Aesthetics (frontend)
- 6.1 Visual and interaction quality: **Cannot Confirm Statistically**.
  - Evidence: static UI structure exists, but responsive/interaction quality requires runtime browser verification (`apps/web/src/routes/+layout.svelte:16`, `apps/web/src/routes/login/+page.svelte:1`).

## 5. Issues / Suggestions (Severity-Rated)

1. Severity: **Medium**
- Title: Workflow assignment model can drift when role roster changes
- Conclusion: **Partial Fail (robustness/auditability risk)**
- Evidence: assignment predicates derive reviewer/approver ownership from current `user_roles` ordering and counts (`apps/api/src/modules/workflow/repository.ts:35`, `apps/api/src/modules/workflow/repository.ts:53`, `apps/api/src/modules/workflow/repository.ts:179`, `apps/api/src/modules/workflow/repository.ts:207`).
- Impact: adding/removing reviewer/approver accounts can re-map which actor is considered assigned for existing applications, affecting continuity and forensic clarity.
- Minimum actionable fix: persist explicit per-application reviewer/approver assignments (or assignment snapshots per iteration) and authorize against persisted ownership.

2. Severity: **Medium**
- Title: Route test depth is broad but frequently mock-heavy
- Conclusion: **Partial Fail (coverage-depth risk)**
- Evidence: route tests stub core dependencies extensively (`apps/api/tests/auth-routes.test.ts:47`, `apps/api/tests/policies-routes.test.ts:23`, `apps/api/tests/researcher-routes.test.ts:25`, `apps/api/tests/researcher-routes.test.ts:67`).
- Impact: contract-level route behavior is checked, but regressions in service/repository integration boundaries may escape until integrated runs.
- Minimum actionable fix: add a smaller set of DB-backed API integration tests for highest-risk flows (auth session lifecycle, researcher submit, workflow decisions, finance reconciliation transitions).

3. Severity: **Low**
- Title: Public-facing docs/UI copy are partially stale versus current slice coverage
- Conclusion: **Fail (documentation fidelity)**
- Evidence: root page message highlights only submission/review/journal slices (`apps/web/src/routes/+page.svelte:2`), while README and code include booking/recommendations/finance (`README.md:10`, `README.md:55`).
- Impact: operator/user understanding of available capabilities can lag implementation.
- Minimum actionable fix: refresh landing copy and quick-start docs to reflect all active slices and current duplicate-prevention semantics.

## 6. Security Review Summary
- authentication entry points: **Pass**
  - Evidence: bootstrap/login/logout/me/change-password implemented with policy + lockout/session behavior (`apps/api/src/modules/auth/routes.ts:24`, `apps/api/src/modules/auth/service.ts:78`, `apps/api/src/modules/auth/repository.ts:122`).
- route-level authorization: **Pass**
  - Evidence: `requireAuthenticated` + `requireRoles` consistently used (`apps/api/src/modules/access-control/guards.ts:27`, `apps/api/src/modules/admin/routes.ts:17`, `apps/api/src/modules/finance/routes.ts:29`).
- object-level authorization: **Pass**
  - Evidence: researcher ownership checks (`apps/api/src/modules/researcher/service.ts:31`), workflow actor-scoped assignment checks (`apps/api/src/modules/workflow/service.ts:81`, `apps/api/src/modules/workflow/service.ts:99`).
- function-level authorization: **Pass**
  - Evidence: decision/status and comment constraints are enforced in service methods (`apps/api/src/modules/workflow/service.ts:216`, `apps/api/src/modules/workflow/service.ts:324`).
- tenant/user data isolation: **Partial Pass**
  - Evidence: per-user ownership/assignment checks exist, but dynamic assignment derivation can shift scope over time (`apps/api/src/modules/workflow/repository.ts:35`, `apps/api/src/modules/workflow/repository.ts:53`).
- admin/internal/debug protection: **Pass**
  - Evidence: admin routes are administrator-gated (`apps/api/src/modules/admin/routes.ts:17`); health endpoint appears intentionally public (`apps/api/src/modules/health/routes.ts:5`).

## 7. Tests and Logging Review
- Unit tests: **Pass (static presence)**
  - Evidence: broad service/helper coverage exists (`apps/api/tests/auth-service.test.ts:1`, `apps/api/tests/workflow-service.test.ts:1`, `apps/api/tests/finance-service.test.ts:1`).
- API/integration route tests: **Pass (breadth), Partial Pass (depth)**
  - Evidence: route suites exist across key modules (`apps/api/tests/auth-routes.test.ts:1`, `apps/api/tests/researcher-routes.test.ts:1`, `apps/api/tests/workflow-routes.test.ts:1`, `apps/api/tests/finance-routes.test.ts:1`).
- Logging/observability: **Pass**
  - Evidence: logger redaction and error envelope are in place (`apps/api/src/lib/logger.ts:7`, `apps/api/src/plugins/error-envelope.ts:24`), with dedicated tests (`apps/api/tests/logger-redaction.test.ts:1`).
- Sensitive-data leakage risk in logs/responses: **Pass (static)**
  - Evidence: sensitive keys are redacted and refund payloads are sanitized (`apps/api/src/lib/logger.ts:11`, `apps/api/src/modules/finance/service.ts:37`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- API uses Vitest (`apps/api/vitest.config.ts:3`); web includes Vitest and Playwright configs (`apps/web/vite.config.ts:1`, `apps/web/playwright.config.ts:6`).
- Coverage exists for route guards and role boundaries plus major service logic, but many route tests rely on mocked downstreams.

### 8.2 Coverage Mapping Table
| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Auth route boundary + payload validation | `apps/api/tests/auth-routes.test.ts:84` | 400/401 route outcomes with mocked auth service | basically covered | mock-heavy | DB-backed auth session lifecycle test |
| Researcher ownership and duplicate handling | `apps/api/tests/researcher-routes.test.ts:94`, `apps/api/tests/researcher-routes.test.ts:122` | 403 ownership denial + 409 duplicate draft | basically covered | limited integration realism | DB-backed submit/resubmit flow test |
| Workflow assignment authorization | `apps/api/tests/workflow-routes.test.ts:295`, `apps/api/tests/workflow-service.test.ts:70` | unassigned approver gets 403; actor assignment maps in service fixtures | basically covered | roster-change drift not tested | tests for reassignment behavior when role roster mutates |
| Finance reconciliation/exception lifecycle | `apps/api/tests/finance-service.test.ts:1`, `apps/api/tests/finance-routes.test.ts:1` | service + route path coverage | basically covered | mostly mocked route dependencies | DB-backed reconciliation state-transition tests |
| Logger redaction | `apps/api/tests/logger-redaction.test.ts:1` | sensitive fields masked | covered | none major | keep list-synced regression tests |

### 8.3 Security Coverage Audit
- authentication: **Covered** (`apps/api/tests/auth-service.test.ts:145`, `apps/api/tests/auth-routes.test.ts:108`)
- route authorization: **Covered** (`apps/api/tests/access-control.test.ts:13`, `apps/api/tests/policies-routes.test.ts:63`)
- object authorization: **Covered, with model caveat** (`apps/api/tests/researcher-routes.test.ts:94`, `apps/api/tests/workflow-routes.test.ts:295`)
- tenant/data isolation: **Partially covered** (ownership/assignment checks exist; drift model edge cases not represented)
- admin/internal protection: **Covered** (`apps/api/tests/admin-routes.test.ts:70`)

### 8.4 Final Coverage Judgment
- **Partial Pass**: breadth is strong, but integration depth for highest-risk flows should be strengthened with a small DB-backed test set.

## 9. Final Notes
- This report is strictly static and evidence-bound; no runtime success claims are made.
- Earlier draft reports in `./.tmp` contain stale findings that do not match current code; this file is the corrected consolidated audit.
