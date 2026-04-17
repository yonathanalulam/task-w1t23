# Static Delivery Acceptance & Project Architecture Audit

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: The repository is substantial and maps to the Prompt’s major business flows, but material security/architecture defects remain (notably unsanitized download filename header construction and non-persistent reviewer/approver assignment semantics), and several high-risk behaviors still require manual/runtime verification.

## 2. Scope and Static Verification Boundary
- Reviewed:
  - Documentation, manifests, scripts, and static architecture descriptions.
  - Backend entry points, route registration, auth/RBAC/object access controls, business modules (researcher/workflow/resource booking/recommendations/finance/journal/admin), migrations, and logging/error wrappers.
  - Frontend route structure/loaders/pages for all stated roles.
  - Test inventory and representative test files across auth, access control, workflow, finance, upload security, and logging redaction.
- Not reviewed:
  - Runtime behavior under actual deployment, browser rendering fidelity, performance/concurrency under load, Docker/runtime integration, and external environment correctness.
- Intentionally not executed:
  - Project startup, Docker, tests, Playwright, API calls.
- Manual verification required for:
  - End-to-end runtime correctness of all UI/API flows, timezone rendering behavior in browsers, CSV reconciliation behavior with real data variance, and visual/aesthetic quality at runtime.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal: an offline-capable RRGA system covering secure submissions, multi-level review/approval, journal governance, resource booking, explainable recommendations, and finance reconciliation/refund ledgering.
- Core flows/constraints mapped statically:
  - Offline auth with password policy + lockout (`apps/api/src/modules/auth/*`, `apps/api/src/lib/config.ts`).
  - Submission lifecycle with required docs, duplicates, cap checks, deadline grace/extension, versioning/rollback (`apps/api/src/modules/researcher/*`).
  - Reviewer/approver workflow and immutable action trails (`apps/api/src/modules/workflow/*`, `apps/api/db/migrations/0004_review_approval_workflow.sql`).
  - Journal CRUD/custom fields/history/attachments (`apps/api/src/modules/journals/*`, `apps/api/db/migrations/0005_journal_governance.sql`).
  - Resource booking business hours/conflicts/capacity/blackouts (`apps/api/src/modules/resource-booking/*`, `apps/api/db/migrations/0006_resource_booking.sql`).
  - Recommendations preferences/feedback/reason strings (`apps/api/src/modules/recommendations/service.ts`).
  - Finance invoices/payments/refunds/CSV reconciliation/exception lifecycle/ledger (`apps/api/src/modules/finance/*`, `apps/api/db/migrations/0008_finance.sql`, `0010_finance_ledger_immutability.sql`).

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: Startup/testing/config and module surfaces are documented and statically align with code structure and route registration.
- Evidence:
  - `repo/README.md:9`
  - `repo/README.md:126`
  - `repo/README.md:195`
  - `repo/apps/api/src/app.ts:45`
  - `repo/apps/api/src/modules/index.ts:31`

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Partial Pass**
- Rationale: Implementation is broadly centered on the Prompt, but assignment semantics for reviewer/approver visibility are dynamically derived from current role roster instead of persisted assignment records, which can materially alter expected workflow ownership boundaries.
- Evidence:
  - `repo/apps/api/src/modules/workflow/repository.ts:35`
  - `repo/apps/api/src/modules/workflow/repository.ts:243`
  - `repo/apps/api/src/modules/workflow/repository.ts:267`
- Manual verification note: Required to confirm whether this dynamic assignment behavior is acceptable in business policy terms.

### 4.2 Delivery Completeness

#### 4.2.1 Coverage of explicit core requirements
- Conclusion: **Partial Pass**
- Rationale: Most explicit features are present (submission rules, journal governance, booking constraints, recommendations with reasons, finance reconciliation/refunds, upload scanning, watermark headers, immutable trails). However, material security weakness exists in download header construction.
- Evidence:
  - `repo/apps/api/src/modules/researcher/service.ts:85`
  - `repo/apps/api/src/modules/researcher/service.ts:121`
  - `repo/apps/api/src/modules/researcher/service.ts:151`
  - `repo/apps/api/src/modules/researcher/service.ts:242`
  - `repo/apps/api/src/modules/researcher/rules.ts:3`
  - `repo/apps/api/src/modules/resource-booking/service.ts:89`
  - `repo/apps/api/src/modules/recommendations/service.ts:314`
  - `repo/apps/api/src/modules/finance/service.ts:430`
  - `repo/apps/api/src/modules/finance/service.ts:568`
  - `repo/apps/api/src/modules/finance/service.ts:766`
  - `repo/apps/api/src/lib/upload-security.ts:223`
  - `repo/apps/api/src/modules/researcher/routes.ts:503`

#### 4.2.2 0→1 end-to-end deliverable shape (vs demo fragment)
- Conclusion: **Pass**
- Rationale: Monorepo has backend+frontend modules, migrations, scripts, docs, and role-specific surfaces; not a single-file sample.
- Evidence:
  - `repo/README.md:117`
  - `repo/package.json:5`
  - `repo/apps/api/src/modules/index.ts:31`
  - `repo/apps/web/src/hooks.server.ts:6`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Modules are partitioned by business domain with dedicated routes/services/repositories; migrations reflect domain boundaries; shared access-control utilities used.
- Evidence:
  - `repo/apps/api/src/modules/index.ts:31`
  - `repo/apps/api/src/modules/access-control/guards.ts:27`
  - `repo/apps/api/db/migrations/0003_researcher_submissions.sql:1`
  - `repo/apps/api/db/migrations/0008_finance.sql:11`

#### 4.3.2 Maintainability/extensibility
- Conclusion: **Partial Pass**
- Rationale: Generally maintainable modular design, but workflow assignment strategy is tightly coupled to mutable role roster and hash math, weakening long-term auditability and stable ownership semantics.
- Evidence:
  - `repo/apps/api/src/modules/workflow/repository.ts:35`
  - `repo/apps/api/src/modules/workflow/repository.ts:53`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling, logging, validation, API design
- Conclusion: **Partial Pass**
- Rationale: Strong error-envelope/logging-redaction/validation baseline exists, but critical response-header construction uses unescaped user-provided filenames.
- Evidence:
  - `repo/apps/api/src/plugins/error-envelope.ts:24`
  - `repo/apps/api/src/lib/logger.ts:7`
  - `repo/apps/api/src/lib/upload-security.ts:232`
  - `repo/apps/api/src/modules/researcher/routes.ts:503`
  - `repo/apps/api/src/modules/workflow/routes.ts:99`
  - `repo/apps/api/src/modules/journals/routes.ts:457`

#### 4.4.2 Product-grade vs demo-grade shape
- Conclusion: **Pass**
- Rationale: Includes auditable persistence, role boundaries, exception lifecycle handling, append-only triggers, and broad route/test scaffolding consistent with a product-style baseline.
- Evidence:
  - `repo/apps/api/db/migrations/0002_auth_rbac_audit.sql:71`
  - `repo/apps/api/db/migrations/0004_review_approval_workflow.sql:40`
  - `repo/apps/api/db/migrations/0010_finance_ledger_immutability.sql:1`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business/constraint understanding and fit
- Conclusion: **Partial Pass**
- Rationale: Implementation tracks most Prompt constraints (offline auth, lockout, upload controls, cap/deadline validation, finance CSV exceptions). The assignment model and header-safety defect reduce fit for secure/auditable workflow handling.
- Evidence:
  - `repo/apps/api/src/modules/auth/password-policy.ts:1`
  - `repo/apps/api/src/lib/config.ts:85`
  - `repo/apps/api/src/modules/researcher/service.ts:143`
  - `repo/apps/api/src/modules/workflow/repository.ts:35`
  - `repo/apps/api/src/modules/finance/service.ts:647`

### 4.6 Aesthetics (frontend/full-stack)

#### 4.6.1 Visual/interaction quality
- Conclusion: **Cannot Confirm Statistically**
- Rationale: Static Svelte structure and role pages exist, but visual quality/alignment/interactive behavior requires runtime browser validation.
- Evidence:
  - `repo/apps/web/src/routes/(researcher)/researcher/+page.svelte:8`
  - `repo/apps/web/src/routes/(finance)/finance/+page.svelte:10`
  - `repo/apps/web/src/routes/(admin)/admin/+page.svelte:11`
- Manual verification note: Browser-based review required for typography, spacing hierarchy, state feedback, and responsive behavior.

## 5. Issues / Suggestions (Severity-Rated)

### [High] Unsanitized filename reflected into `Content-Disposition` headers
- Severity: **High**
- Conclusion: **Fail**
- Evidence:
  - `repo/apps/api/src/modules/researcher/repository.ts:814`
  - `repo/apps/api/src/modules/journals/repository.ts:632`
  - `repo/apps/api/src/modules/researcher/routes.ts:503`
  - `repo/apps/api/src/modules/workflow/routes.ts:99`
  - `repo/apps/api/src/modules/journals/routes.ts:457`
- Impact: Uploaded filename (attacker-controlled) is interpolated directly into response headers; this can create header-injection/splitting risk and unreliable downstream handling.
- Minimum actionable fix: Centralize safe download header builder using RFC 5987-safe encoding + strict character filtering; reject CR/LF and unsafe bytes; use fallback sanitized filename.

### [High] Reviewer/approver assignment is not persisted and depends on mutable role roster
- Severity: **High**
- Conclusion: **Fail**
- Evidence:
  - `repo/apps/api/src/modules/workflow/repository.ts:35`
  - `repo/apps/api/src/modules/workflow/repository.ts:53`
  - `repo/apps/api/src/modules/workflow/repository.ts:243`
  - `repo/apps/api/src/modules/workflow/repository.ts:267`
- Impact: Changing `user_roles` can re-map access to in-flight/historical applications, undermining stable ownership, least privilege, and audit traceability.
- Minimum actionable fix: Persist explicit assignment records per application/stage and enforce access against stored assignments; treat roster/hash only as initial allocator.

### [Medium] Admin hold-release note can become empty after `trim()` despite schema `minLength`
- Severity: **Medium**
- Conclusion: **Partial Fail**
- Evidence:
  - `repo/apps/api/src/modules/admin/routes.ts:60`
  - `repo/apps/api/src/modules/admin/routes.ts:84`
  - `repo/apps/api/src/modules/admin/routes.ts:115`
  - `repo/apps/api/src/modules/admin/routes.ts:139`
- Impact: Audit entries may contain empty/meaningless release rationale, weakening compliance and incident reconstruction.
- Minimum actionable fix: Revalidate post-trim (`note.length >= 3`) before processing and reject whitespace-only note payloads.

### [Medium | Suspected Risk] No explicit anti-CSRF token/origin check for cookie-auth mutation routes
- Severity: **Medium**
- Conclusion: **Cannot Confirm Statistically (Suspected Risk)**
- Evidence:
  - `repo/apps/api/src/modules/auth/routes.ts:73`
  - `repo/apps/api/src/modules/auth/routes.ts:149`
  - `repo/apps/api/src/app.ts:49`
- Impact: With cookie-based auth, state-changing endpoints may still be at CSRF risk depending on deployment origins/content-types/browser behavior.
- Minimum actionable fix: Add explicit CSRF strategy (token-based or strict origin/referer validation for mutation routes) and corresponding security tests.

## 6. Security Review Summary

- Authentication entry points: **Pass**
  - Evidence: password policy + lockout/session handling implemented (`repo/apps/api/src/modules/auth/password-policy.ts:1`, `repo/apps/api/src/modules/auth/service.ts:111`, `repo/apps/api/src/lib/config.ts:85`).
- Route-level authorization: **Partial Pass**
  - Evidence: common guards and role checks are used (`repo/apps/api/src/modules/access-control/guards.ts:27`, `repo/apps/api/src/modules/admin/routes.ts:17`, `repo/apps/api/src/modules/finance/routes.ts:29`).
  - Caveat: CSRF hardening explicitness is insufficient statically.
- Object-level authorization: **Partial Pass**
  - Evidence: researcher ownership checks and workflow scoped fetches exist (`repo/apps/api/src/modules/researcher/service.ts:30`, `repo/apps/api/src/modules/workflow/service.ts:111`).
  - Caveat: workflow object access depends on mutable dynamic roster logic (`repo/apps/api/src/modules/workflow/repository.ts:35`).
- Function-level authorization: **Pass**
  - Evidence: role-specific route groups with dedicated handlers are consistently applied (`repo/apps/api/src/modules/researcher/routes.ts:59`, `repo/apps/api/src/modules/workflow/routes.ts:136`, `repo/apps/api/src/modules/finance/routes.ts:28`).
- Tenant/user data isolation: **Partial Pass**
  - Evidence: researcher own-application enforcement exists (`repo/apps/api/src/modules/researcher/service.ts:36`), but workflow assignment mutability can shift user visibility.
- Admin/internal/debug endpoint protection: **Pass**
  - Evidence: admin endpoints are protected by `requireAuthenticated + requireRoles(administrator)` (`repo/apps/api/src/modules/admin/routes.ts:17`); health endpoint is intentionally public (`repo/apps/api/src/modules/health/routes.ts:9`).

## 7. Tests and Logging Review

- Unit tests: **Pass**
  - Evidence: broad Vitest unit/service tests across modules (`repo/apps/api/package.json:11`, `repo/apps/api/tests/auth-service.test.ts:264`, `repo/apps/api/tests/researcher-service.test.ts:167`, `repo/apps/api/tests/workflow-service.test.ts:258`, `repo/apps/api/tests/finance-service.test.ts:622`).
- API/integration tests: **Partial Pass**
  - Evidence: route-level inject tests exist for many modules (`repo/apps/api/tests/finance-routes.test.ts:65`, `repo/apps/api/tests/researcher-routes.test.ts:92`, `repo/apps/api/tests/journal-governance-routes.test.ts:1`).
  - Gap: no direct test evidence for safe `Content-Disposition` filename handling or persisted workflow assignment invariants.
- Logging categories/observability: **Pass**
  - Evidence: structured logger with redaction and audit event writes (`repo/apps/api/src/lib/logger.ts:4`, `repo/apps/api/src/modules/access-control/guards.ts:14`, `repo/apps/api/tests/logger-redaction.test.ts:59`).
- Sensitive-data leakage risk in logs/responses: **Partial Pass**
  - Evidence: redaction and refund-field sanitization tests exist (`repo/apps/api/src/lib/logger.ts:7`, `repo/apps/api/tests/finance-service.test.ts:373`, `repo/apps/api/tests/logger-redaction.test.ts:95`).
  - Gap: response-header filename injection risk remains (see High issue).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist: **Yes** (`Vitest`) in API and web workspaces.
- API/integration-style tests exist: **Yes** (`fastify.inject` route tests).
- E2E tests exist statically: **Yes** (`Playwright`) but not executed in this audit.
- Test entry points and commands documented: **Yes**.
- Evidence:
  - `repo/apps/api/package.json:11`
  - `repo/apps/web/package.json:12`
  - `repo/apps/web/package.json:13`
  - `repo/package.json:12`
  - `repo/package.json:15`
  - `repo/README.md:195`
  - `docs/test-coverage.md:7`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Password complexity + lockout after 5 failures/15 min policy | `repo/apps/api/tests/auth-service.test.ts:264` | lockout config in fixture and `ACCOUNT_LOCKED` assertion (`repo/apps/api/tests/auth-service.test.ts:273`, `:316`) | sufficient | none major | add route-level lockout + cookie/session invalidation scenario |
| 401/403 guard behavior | `repo/apps/api/tests/access-control.test.ts:13` | explicit 401/403 assertions (`repo/apps/api/tests/access-control.test.ts:30`, `:55`) | sufficient | none major | add audit payload assertions for denied events |
| Duplicate application / cap / deadline enforcement | `repo/apps/api/tests/researcher-service.test.ts:168` | checks `DUPLICATE_APPLICATION`, `FUNDING_CAP_EXCEEDED`, `SUBMISSION_BLOCKED_LATE` (`:179`, `:193`, `:208`) | sufficient | none major | add boundary tests around fiscal-year transitions |
| Document version cap (20) + rollback | `repo/apps/api/tests/researcher-service.test.ts:239` | `DOCUMENT_VERSION_LIMIT_REACHED` and rollback call assertion (`:272`, `:290`) | basically covered | no route-level file-upload edge coverage | add route test for 20th/21st upload behavior |
| Workflow object authorization (assigned vs unassigned) | `repo/apps/api/tests/workflow-service.test.ts:258` | unassigned actors denied for detail/doc/decision/sign-off (`:262`, `:287`) | basically covered | assignment stability under role roster mutation untested | add DB-backed test proving persistent assignment invariance after role changes |
| Held-document access denial in workflow | `repo/apps/api/tests/workflow-service.test.ts:447` | `DOCUMENT_HELD_FOR_ADMIN_REVIEW` assertions (`:454`, `:464`) | sufficient | none major | add paired route-level denial test for preview/download |
| Finance reconciliation exception lifecycle | `repo/apps/api/tests/finance-service.test.ts:622` | resolve/close assertions + ledger event check (`:665`, `:685`, `:691`) | sufficient | none major | add malformed CSV and duplicate row idempotency tests |
| Sensitive refund fields encrypted at rest and masked in service output | `repo/apps/api/tests/finance-service.test.ts:360` | encrypted storage + no plaintext in response/detail (`:379`, `:383`, `:386`) | sufficient | none major | add negative test for missing encryption key path at route layer |
| Log redaction for nested sensitive fields | `repo/apps/api/tests/logger-redaction.test.ts:59` | output contains `[REDACTED]` and excludes secrets (`:95`-`:109`) | sufficient | none major | add request/response serializer-level regression test |
| Download filename/header safety | no direct mapped test found | none | missing | severe header safety blind spot | add route tests with CR/LF and quote/semicolon filenames; assert safe encoded header |
| CSRF controls on cookie-auth mutation routes | no direct mapped test found | none | insufficient | severe defects could pass current suite | add integration tests validating CSRF token/origin checks for POST/PATCH/DELETE |

### 8.3 Security Coverage Audit
- Authentication: **Basically covered** by service and route tests; major lockout/policy paths are present.
- Route authorization: **Basically covered** for 401/403 and role gates in multiple modules.
- Object-level authorization: **Partially covered**; positive denial tests exist, but assignment stability invariants are not covered.
- Tenant/data isolation: **Partially covered**; researcher ownership checks are tested, but cross-user visibility regressions tied to dynamic workflow assignment could remain undetected.
- Admin/internal protection: **Basically covered** for role gates; CSRF hardening coverage is absent.

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Boundary explanation:
  - Covered: core auth rules, baseline RBAC denials, major submission/workflow/finance service paths, and logging redaction.
  - Uncovered/insufficient: filename/header safety regression tests, explicit CSRF coverage, and assignment persistence/invariance under role-roster changes. These gaps mean severe security defects could still remain while tests pass.

## 9. Final Notes
- This audit is static-only and does not claim runtime success.
- Strong conclusions above are evidence-backed and tied to file-line references.
- Manual verification remains required for runtime/browser behavior and deployment-specific security posture.
