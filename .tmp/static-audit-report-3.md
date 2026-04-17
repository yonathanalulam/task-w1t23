# Static Delivery Acceptance & Architecture Audit (RRGA)

Date: 2026-04-05
Mode: static-only (no runtime execution)

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: implementation breadth is strong and prompt-aligned, but two material security risks remain: mutable-roster workflow authorization drift and unauthenticated first-admin bootstrap exposure.

## 2. Scope and Static Verification Boundary
- Reviewed: README/scripts/config, API entry points and route registration, auth/authorization, business modules (researcher/workflow/journals/resource-booking/recommendations/finance), admin/internal routes, migrations, API/web tests.
- Not executed: app startup, Docker, tests, migrations, browser flows.
- Intentionally not executed: all runtime commands.
- Manual verification required: production deployment hardening, runtime UI/UX behavior, concurrency/race outcomes under load.

## 3. Repository / Requirement Mapping Summary
- Prompt requires offline auth, secure submissions + versioning/rollback, deadline/grace/extension logic, multi-level approvals, journal governance with custom fields/history, resource booking constraints, explainable recommendations, and offline reconciliation/ledger.
- Mapping found across modules and routes (`apps/api/src/modules/index.ts:124`) and web role surfaces (`apps/web/src/hooks.server.ts:6`), with migrations covering all slices (`apps/api/migrations/0008_finance.sql:1`, `apps/api/migrations/0011_application_period_overlap_semantics.sql:1`).
- Key constraints evidenced: password/lockout (`apps/api/src/modules/auth/service.ts:159`), upload hardening (`apps/api/src/lib/upload-security.ts:223`), 20-version cap + rollback (`apps/api/src/modules/researcher/rules.ts:3`, `apps/api/src/modules/researcher/service.ts:376`), one-time extension (`apps/api/src/modules/researcher/service.ts:434`), offline finance reconciliation (`apps/api/src/modules/finance/service.ts:583`).

## 4. Section-by-section Review

### 4.1 Hard Gates
- **1.1 Documentation and static verifiability**
  - Conclusion: **Pass**
  - Rationale: startup/test/config and route inventory are documented and map to code structure.
  - Evidence: `README.md:9`, `README.md:117`, `README.md:126`, `apps/api/src/modules/index.ts:124`, `run_tests.sh:19`

- **1.2 Material deviation from Prompt**
  - Conclusion: **Pass**
  - Rationale: implementation remains centered on the stated business domains and does not replace core scope.
  - Evidence: `README.md:10`, `README.md:46`, `README.md:55`, `README.md:60`, `apps/api/src/modules/index.ts:127`, `apps/api/src/modules/index.ts:132`

### 4.2 Delivery Completeness
- **2.1 Core explicit requirements coverage**
  - Conclusion: **Partial Pass**
  - Rationale: core features are implemented, but there are security-critical gaps in authorization stability/bootstrap hardening.
  - Evidence: upload controls (`apps/api/src/lib/upload-security.ts:232`), deadline + extension (`apps/api/src/modules/researcher/service.ts:179`, `apps/api/src/modules/researcher/service.ts:212`), approvals (`apps/api/src/modules/workflow/service.ts:337`), recommendations reasons (`apps/api/src/modules/recommendations/service.ts:262`), finance reconciliation (`apps/api/src/modules/finance/service.ts:595`), encrypted refund fields (`apps/api/src/modules/finance/service.ts:487`)
  - Manual verification note: timezone UX and watermark rendering behavior require runtime validation.

- **2.2 End-to-end deliverable shape**
  - Conclusion: **Pass**
  - Rationale: full-stack monorepo with backend/frontend/shared packages, migrations, and tests.
  - Evidence: `README.md:9`, `apps/api/src/app.ts:30`, `apps/web/src/hooks.server.ts:37`, `apps/api/tests/auth-routes.test.ts:4`, `apps/web/tests/integrated-flows.spec.ts:1`

### 4.3 Engineering and Architecture Quality
- **3.1 Structure and module decomposition**
  - Conclusion: **Pass**
  - Rationale: clear separation of routes/services/repositories per slice.
  - Evidence: `apps/api/src/modules/index.ts:29`, `apps/api/src/modules/researcher/service.ts:23`, `apps/api/src/modules/finance/service.ts:165`

- **3.2 Maintainability and extensibility**
  - Conclusion: **Partial Pass**
  - Rationale: most domains are extensible; workflow assignment derives authorization from mutable role roster rather than persisted assignment records.
  - Evidence: `apps/api/src/modules/workflow/repository.ts:35`, `apps/api/src/modules/workflow/repository.ts:53`, `apps/api/src/modules/workflow/service.ts:91`, `apps/api/src/modules/workflow/service.ts:110`

### 4.4 Engineering Details and Professionalism
- **4.1 Error handling, logging, validation, API design**
  - Conclusion: **Pass**
  - Rationale: centralized HTTP envelope, schema validation, and sensitive-field redaction are present.
  - Evidence: `apps/api/src/plugins/error-envelope.ts:24`, `apps/api/src/modules/finance/routes.ts:43`, `apps/api/src/lib/logger.ts:7`

- **4.2 Real product/service shape vs demo**
  - Conclusion: **Pass**
  - Rationale: role-isolated API/web surfaces and non-trivial workflow/finance/reconciliation paths are implemented.
  - Evidence: `README.md:79`, `apps/web/src/routes/(researcher)/researcher/+page.svelte:8`, `apps/web/src/routes/(finance)/finance/+page.svelte:8`

### 4.5 Prompt Understanding and Requirement Fit
- **5.1 Business-goal and constraint fit**
  - Conclusion: **Partial Pass**
  - Rationale: semantic fit is strong, but two security posture issues conflict with strict production-grade interpretation.
  - Evidence: `apps/api/src/modules/auth/routes.ts:24`, `apps/web/src/routes/session/bootstrap-admin/+server.ts:4`, `apps/api/src/modules/workflow/repository.ts:35`

### 4.6 Aesthetics (frontend-only/full-stack)
- **6.1 Visual and interaction quality**
  - Conclusion: **Cannot Confirm Statistically**
  - Rationale: static code confirms page structure, but visual consistency/responsiveness/interaction fidelity require runtime browser checks.
  - Evidence: `apps/web/src/routes/+layout.svelte:16`, `apps/web/src/routes/login/+page.svelte:1`, `apps/web/src/routes/(researcher)/researcher/+page.svelte:1`
  - Manual verification note: inspect desktop/mobile role flows in browser.

## 5. Issues / Suggestions (Severity-Rated)

1) Severity: **High**
- Title: Workflow assignment authorization can drift when role roster changes
- Conclusion: **Partial Fail (authorization integrity risk)**
- Evidence: reviewer/approver access predicates use current `user_roles` ordering/counts (`apps/api/src/modules/workflow/repository.ts:35`, `apps/api/src/modules/workflow/repository.ts:53`); service authorization depends on those predicates (`apps/api/src/modules/workflow/service.ts:91`, `apps/api/src/modules/workflow/service.ts:110`).
- Impact: adding/removing reviewer/approver users can silently change who is authorized for existing applications.
- Minimum actionable fix: persist explicit per-application/per-iteration assignment records and authorize against persisted assignments.

2) Severity: **High**
- Title: Bootstrap-admin path is unauthenticated and not explicitly deployment-gated
- Conclusion: **Partial Fail (fresh-instance takeover risk)**
- Evidence: unauthenticated API bootstrap route (`apps/api/src/modules/auth/routes.ts:24`), publicly callable web proxy route (`apps/web/src/routes/session/bootstrap-admin/+server.ts:4`), hooks skip auth for `/session/*` (`apps/web/src/hooks.server.ts:40`), bootstrap succeeds when no users exist (`apps/api/src/modules/auth/service.ts:93`, `apps/api/src/modules/auth/repository.ts:140`).
- Impact: if a new environment is reachable before trusted setup, an external actor can claim first admin.
- Minimum actionable fix: require one-time bootstrap secret/env gate and/or trusted-local-only binding, then disable bootstrap after initialization.

3) Severity: **Medium**
- Title: Workflow authorization edge cases are under-tested against real repository predicates
- Conclusion: **Partial Fail (coverage gap for high-risk logic)**
- Evidence: workflow route tests use in-memory mocked assignment maps (`apps/api/tests/workflow-routes.test.ts:30`, `apps/api/tests/workflow-routes.test.ts:49`) instead of DB-backed assignment predicate behavior.
- Impact: authorization regressions in real SQL assignment logic may evade tests.
- Minimum actionable fix: add DB-backed workflow integration tests that mutate reviewer/approver roster between assignment and decision.

4) Severity: **Low**
- Title: README duplicate-prevention statement is stale vs overlap semantics
- Conclusion: **Fail (doc-code mismatch)**
- Evidence: README still states `policy_id + applicant_user_id` uniqueness (`README.md:266`), but migration drops that constraint (`apps/api/migrations/0011_application_period_overlap_semantics.sql:1`) and repository enforces overlap checks (`apps/api/src/modules/researcher/repository.ts:567`).
- Impact: operator expectations and test assumptions can diverge from actual behavior.
- Minimum actionable fix: update README to overlap-based duplicate semantics.

## 6. Security Review Summary
- authentication entry points: **Partial Pass**
  - Evidence: robust login/session/lockout and hashing (`apps/api/src/modules/auth/service.ts:159`, `apps/api/src/modules/auth/crypto.ts:19`), but unauthenticated bootstrap remains (`apps/api/src/modules/auth/routes.ts:24`).

- route-level authorization: **Pass**
  - Evidence: centralized guards and role checks (`apps/api/src/modules/access-control/guards.ts:27`, `apps/api/src/modules/access-control/guards.ts:40`), applied in sensitive modules (`apps/api/src/modules/admin/routes.ts:17`, `apps/api/src/modules/finance/routes.ts:31`).

- object-level authorization: **Partial Pass**
  - Evidence: explicit owner checks for researcher data (`apps/api/src/modules/researcher/service.ts:31`, `apps/api/src/modules/access-control/object-authorization.ts:18`); workflow access depends on mutable roster-derived assignment (`apps/api/src/modules/workflow/repository.ts:35`).

- function-level authorization: **Pass**
  - Evidence: reviewer/approver comments and state gates are enforced (`apps/api/src/modules/workflow/service.ts:224`, `apps/api/src/modules/workflow/service.ts:324`), finance exception lifecycle controls status transitions (`apps/api/src/modules/finance/service.ts:184`).

- tenant / user isolation: **Partial Pass**
  - Evidence: user ownership boundaries exist (`apps/api/src/modules/researcher/routes.ts:169`), but assignment drift can alter effective scope over time (`apps/api/src/modules/workflow/repository.ts:53`).

- admin / internal / debug protection: **Partial Pass**
  - Evidence: admin routes role-gated (`apps/api/src/modules/admin/routes.ts:17`), health is public by design (`apps/api/src/modules/health/routes.ts:5`), bootstrap is intentionally open pre-initialization (`apps/api/src/modules/auth/routes.ts:24`).

## 7. Tests and Logging Review
- Unit tests: **Pass**
  - Evidence: API service tests across core modules (`apps/api/tests/auth-service.test.ts:1`, `apps/api/tests/workflow-service.test.ts:1`, `apps/api/tests/finance-service.test.ts:1`).

- API / integration tests: **Partial Pass**
  - Evidence: several DB-backed integration route suites (`apps/api/tests/auth-routes.test.ts:4`, `apps/api/tests/researcher-routes.test.ts:4`, `apps/api/tests/policies-routes.test.ts:4`), but workflow route authorization tests are mocked (`apps/api/tests/workflow-routes.test.ts:30`).

- Logging categories / observability: **Pass**
  - Evidence: redacted logger config and audit events for denied access/business actions (`apps/api/src/lib/logger.ts:7`, `apps/api/src/modules/access-control/guards.ts:14`, `apps/api/src/modules/finance/service.ts:754`).

- Sensitive-data leakage risk in logs / responses: **Pass (static)**
  - Evidence: redaction includes banking/account fields (`apps/api/src/lib/logger.ts:21`), refund response sanitization nulls encrypted bank fields (`apps/api/src/modules/finance/service.ts:37`, `apps/api/src/modules/finance/service.ts:579`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Frameworks: Vitest API (`apps/api/vitest.config.ts:3`), Vitest web (`apps/web/vite.config.ts:14`), Playwright web e2e (`apps/web/playwright.config.ts:1`, `apps/web/playwright.config.ts:7`).
- Entry points: API tests in `apps/api/tests/**/*.test.ts` (`apps/api/vitest.config.ts:6`), web unit tests in `apps/web/tests/**/*.test.ts` (`apps/web/vite.config.ts:16`), Playwright specs in `apps/web/tests/**/*.spec.ts` (`apps/web/playwright.config.ts:8`).
- Test command docs exist (`README.md:195`, `README.md:237`, `run_tests.sh:25`).

### 8.2 Coverage Mapping Table
| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Auth lifecycle + 401 guards | `apps/api/tests/auth-routes.test.ts:53`, `apps/api/tests/auth-routes.test.ts:70` | unauthenticated 401 + bootstrap/login/me/change-password/logout flow | sufficient | bootstrap hardening not assessed | add integration case asserting bootstrap gate behavior |
| Researcher submit + ownership/403 | `apps/api/tests/researcher-routes.test.ts:121`, `apps/api/tests/researcher-routes.test.ts:138` | submit access 401 and end-to-end submission path with policy/doc/session | basically covered | edge matrix around late/extension concurrency not deep | add tests for extension-used + blocked states under repeated submit |
| Workflow route authorization | `apps/api/tests/workflow-routes.test.ts:10`, `apps/api/tests/workflow-routes.test.ts:37` | mocked assignment maps enforce 403 for wrong actor | insufficient | does not exercise real SQL assignment predicates | add DB-backed workflow route tests against repository logic |
| Workflow assignment drift under roster change | no direct test found | N/A | missing | severe auth continuity bug could pass | add integration test mutating user_roles after assignment |
| Finance settlement exception lifecycle | `apps/api/tests/finance-routes.test.ts:1`, `apps/api/tests/finance-service.test.ts:1` | invoice/payment/refund/reconciliation route/service coverage | basically covered | key-management/hardening edge assertions unclear | add explicit tests for `ENCRYPTION_KEY_MISSING` and sanitized refund payload |
| Logger redaction | `apps/api/tests/logger-redaction.test.ts:1` | verifies sensitive field masking | sufficient | none significant | maintain regression list as schema evolves |

### 8.3 Security Coverage Audit
- authentication: **Basically covered**, but bootstrap deployment-hardening behavior is not meaningfully tested.
- route authorization: **Covered** for many 401/403 role boundaries.
- object-level authorization: **Partially covered**; researcher ownership is tested, workflow assignment logic is not validated through real DB predicates in route tests.
- tenant / data isolation: **Partially covered**; ownership checks exist but roster-drift isolation risk is untested.
- admin / internal protection: **Partly covered**; admin RBAC is tested, bootstrap-open posture is not security-gated by tests.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Core happy paths and many boundary failures are covered, but high-risk authorization continuity and bootstrap hardening are not sufficiently tested; severe defects in those areas could remain undetected.

## 9. Final Notes
- This report is static-only and evidence-based.
- Runtime-dependent conclusions are marked for manual verification.
