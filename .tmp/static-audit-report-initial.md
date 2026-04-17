# Static Delivery Acceptance & Architecture Audit (RRGA)

Date: 2026-04-05  
Mode: Static-only (no runtime execution)

## 1. Verdict
- Overall conclusion: **Fail**
- Primary basis: high-severity security/requirement risks were found, including a file-upload path traversal risk and non-atomic enforcement of the 20-version cap.

## 2. Scope and Static Verification Boundary
- Reviewed:
  - Documentation, scripts, manifests: `README.md:1`, `package.json:1`, `apps/api/package.json:1`, `apps/web/package.json:1`, `run_app.sh:1`, `run_tests.sh:1`, `scripts/run_integrated_e2e.sh:1`
  - Backend entrypoints/module wiring/security/business modules/migrations/tests: `apps/api/src/**`, `apps/api/migrations/**`, `apps/api/tests/**`
  - Frontend role routing/pages/server endpoints/tests: `apps/web/src/**`, `apps/web/tests/**`, `apps/web/playwright.config.ts:1`
- Not reviewed:
  - External services/infrastructure beyond repository files.
  - Runtime behavior in live environment.
- Intentionally not executed:
  - Project startup, Docker, tests, browser flows, DB migrations, external network calls.
- Claims requiring manual verification:
  - End-to-end runtime behavior, UI responsiveness/visual rendering across browsers/devices, deployment-time config correctness, real DB contention/concurrency behavior under load.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal mapped: offline auth + role-based RRGA system with researcher submissions/versioned documents, multi-level review/approval, journal governance, resource booking, explainable recommendations, and offline finance/reconciliation.
- Main implementation areas mapped:
  - Auth/RBAC/session/audit: `apps/api/src/modules/auth/*`, `apps/api/src/modules/access-control/*`, `apps/api/src/modules/admin/routes.ts:16`
  - Submission/workflow/docs/versioning/rollback: `apps/api/src/modules/researcher/*`, `apps/api/src/modules/workflow/*`
  - Journal governance/custom fields/attachments/history: `apps/api/src/modules/journals/*`
  - Resource booking/business hours/capacity/blackouts/conflicts: `apps/api/src/modules/resource-booking/*`
  - Recommendations with reasons/feedback/preferences: `apps/api/src/modules/recommendations/service.ts:193`
  - Finance invoices/payments/refunds/reconciliation/ledger: `apps/api/src/modules/finance/*`, `apps/api/migrations/0008_finance.sql:1`

## 4. Section-by-section Review

### 4.1 Hard Gates
#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: Startup, config, test, route scope, and repo layout are documented and statically align with module registration and scripts.
- Evidence: `README.md:9`, `README.md:117`, `README.md:126`, `README.md:195`, `apps/api/src/modules/index.ts:124`, `package.json:9`, `run_app.sh:56`, `run_tests.sh:19`

#### 4.1.2 Material deviation from Prompt
- Conclusion: **Partial Pass**
- Rationale: Core domain slices are implemented and aligned. However, one high-risk implementation defect (researcher upload path traversal) materially weakens secure submissions requirement; concurrency gap weakens strict “max 20 versions” rule enforcement.
- Evidence: `apps/api/src/modules/index.ts:124`, `apps/api/src/modules/researcher/routes.ts:222`, `apps/api/src/modules/researcher/repository.ts:978`, `apps/api/src/modules/researcher/service.ts:268`

### 4.2 Delivery Completeness
#### 4.2.1 Coverage of explicit core requirements
- Conclusion: **Partial Pass**
- Rationale: Most explicit requirements are implemented (auth policy, offline finance, reconciliation queue, watermarking, versioning, rollback, workflow comments/levels, booking rules, recommendations with reasons). Two critical enforcement gaps remain (path safety and version-cap race).
- Evidence: `apps/api/src/modules/auth/password-policy.ts:1`, `apps/api/src/lib/config.ts:85`, `apps/api/src/modules/researcher/routes.ts:336`, `apps/api/src/modules/resource-booking/repository.ts:148`, `apps/api/src/modules/recommendations/service.ts:227`, `apps/api/src/modules/finance/routes.ts:199`, `apps/api/src/modules/researcher/repository.ts:978`

#### 4.2.2 End-to-end 0->1 deliverable (vs demo/fragment)
- Conclusion: **Pass**
- Rationale: Monorepo with API+web+migrations+tests+scripts is present; not a single-file demo.
- Evidence: `README.md:9`, `apps/api/src/index.ts:1`, `apps/web/src/routes/+layout.svelte:16`, `apps/api/migrations/0001_baseline.sql:1`, `apps/api/tests/health.test.ts:1`

### 4.3 Engineering and Architecture Quality
#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Domain slices are modular and registered cleanly; responsibilities are reasonably separated by module/service/repository/routes.
- Evidence: `apps/api/src/modules/index.ts:29`, `apps/api/src/modules/researcher/service.ts:86`, `apps/api/src/modules/finance/service.ts:165`, `apps/web/src/routes/+layout.svelte:16`

#### 4.3.2 Maintainability and extensibility
- Conclusion: **Partial Pass**
- Rationale: Structure is generally maintainable, but key safety logic is inconsistent across modules (journal attachment key validated, researcher document key not), creating extension risk and security drift.
- Evidence: `apps/api/src/modules/journals/service.ts:440`, `apps/api/src/modules/researcher/routes.ts:244`, `apps/api/src/modules/researcher/service.ts:277`

### 4.4 Engineering Details and Professionalism
#### 4.4.1 Error handling/logging/validation/API design
- Conclusion: **Partial Pass**
- Rationale: Strong global error envelope and structured logging exist, with many schema validations. But malformed researcher link URLs can trigger generic 500 path due uncaught `new URL(...)` error; money input format validation is weak at route schema boundary.
- Evidence: `apps/api/src/plugins/error-envelope.ts:25`, `apps/api/src/lib/logger.ts:7`, `apps/api/src/modules/researcher/routes.ts:275`, `apps/api/src/modules/researcher/service.ts:325`, `apps/api/src/modules/finance/routes.ts:51`

#### 4.4.2 Product-like deliverable vs demo
- Conclusion: **Pass**
- Rationale: Multi-role surfaces, persistence schema, audit/ledger patterns, and broad test suites indicate product-like structure.
- Evidence: `apps/web/src/routes/(researcher)/researcher/+page.svelte:8`, `apps/web/src/routes/(finance)/finance/+page.svelte:8`, `apps/api/migrations/0008_finance.sql:93`, `apps/api/tests/finance-service.test.ts:1`

### 4.5 Prompt Understanding and Requirement Fit
#### 4.5.1 Business/semantic fit to prompt and constraints
- Conclusion: **Partial Pass**
- Rationale: Business semantics are largely captured (eligibility, duplicate policy period, annual cap, deadlines/grace/extension, explainable recommendations, offline reconciliation). Security-critical upload path safety gap violates secure submission intent.
- Evidence: `apps/api/src/modules/researcher/service.ts:113`, `apps/api/src/modules/researcher/service.ts:149`, `apps/api/src/modules/researcher/rules.ts:39`, `apps/api/src/modules/recommendations/service.ts:227`, `apps/api/src/modules/researcher/repository.ts:978`

### 4.6 Aesthetics (frontend/full-stack)
#### 4.6.1 Visual and interaction quality
- Conclusion: **Partial Pass**
- Rationale: Static code shows consistent spacing, hierarchy, status tones, and role-area separation. Runtime rendering quality, responsive behavior, and interaction fidelity cannot be fully proven without execution.
- Evidence: `apps/web/src/routes/+layout.svelte:61`, `apps/web/src/routes/(researcher)/researcher/+page.svelte:134`, `apps/web/src/routes/(finance)/finance/+page.svelte:148`, `apps/web/src/routes/(admin)/admin/journals/+page.svelte:157`
- Manual verification note: responsive behavior and browser rendering are **Manual Verification Required**.

## 5. Issues / Suggestions (Severity-Rated)

### 5.1 High
1. Severity: **High**  
   Title: Researcher document upload path traversal via unsanitized `documentKey`  
   Conclusion: **Fail**  
   Evidence: `apps/api/src/modules/researcher/routes.ts:244`, `apps/api/src/modules/researcher/routes.ts:247`, `apps/api/src/modules/researcher/repository.ts:978`, `apps/api/src/modules/researcher/repository.ts:981`  
   Impact: Attacker-controlled key can influence filesystem path construction and potentially write outside intended upload subdirectory. This directly violates secure upload boundary expectations.  
   Minimum actionable fix: enforce strict server-side `documentKey` whitelist regex (similar to journal `attachmentKey`), canonicalize + verify resolved path remains under upload root before write.

2. Severity: **High**  
   Title: 20-version cap is non-atomic and race-prone  
   Conclusion: **Fail**  
   Evidence: `apps/api/src/modules/researcher/service.ts:268`, `apps/api/src/modules/researcher/service.ts:271`, `apps/api/src/modules/researcher/repository.ts:1010`, `apps/api/src/modules/researcher/repository.ts:1017`  
   Impact: Concurrent uploads can pass pre-check and insert beyond the required 20-version limit, violating prompt’s hard cap semantics.  
   Minimum actionable fix: enforce cap inside one DB transaction/lock (e.g., `SELECT ... FOR UPDATE` on document row and re-check) and/or DB-level constraint/trigger to reject version number > 20.

### 5.2 Medium
3. Severity: **Medium**  
   Title: Invalid researcher link URL can return generic 500 instead of controlled validation error  
   Conclusion: **Fail**  
   Evidence: `apps/api/src/modules/researcher/routes.ts:275`, `apps/api/src/modules/researcher/service.ts:325`, `apps/api/src/plugins/error-envelope.ts:45`  
   Impact: malformed URL payloads can produce internal error envelope behavior rather than clean 400 validation path, reducing API reliability and debuggability.  
   Minimum actionable fix: add route schema URL format and wrap URL parsing in try/catch returning `HttpError(400, ...)`.

4. Severity: **Medium**  
   Title: Finance amount fields are weakly validated at route schema boundary  
   Conclusion: **Partial Fail**  
   Evidence: `apps/api/src/modules/finance/routes.ts:51`, `apps/api/src/modules/finance/routes.ts:102`, `apps/api/src/modules/finance/routes.ts:149`, `apps/api/src/modules/finance/service.ts:20`  
   Impact: non-canonical decimals/edge numeric strings rely on later parsing/rounding behavior, increasing risk of inconsistent validation and client confusion.  
   Minimum actionable fix: use strict decimal regex (`^\d+(?:\.\d{1,2})?$`) in finance route schemas for all monetary fields.

## 6. Security Review Summary

- Authentication entry points: **Pass**  
  Evidence: `apps/api/src/modules/auth/routes.ts:50`, `apps/api/src/modules/auth/service.ts:159`, `apps/api/src/modules/auth/password-policy.ts:1`, `apps/api/src/lib/config.ts:85`  
  Reasoning: password policy and lockout semantics are implemented; session cookie auth integrated via request hook.

- Route-level authorization: **Pass**  
  Evidence: `apps/api/src/modules/access-control/guards.ts:27`, `apps/api/src/modules/finance/routes.ts:29`, `apps/api/src/modules/admin/routes.ts:17`, `apps/api/src/modules/workflow/routes.ts:134`  
  Reasoning: protected endpoints consistently apply `requireAuthenticated` + role guards.

- Object-level authorization: **Partial Pass**  
  Evidence: `apps/api/src/modules/access-control/object-authorization.ts:8`, `apps/api/src/modules/researcher/routes.ts:314`, `apps/api/src/modules/workflow/service.ts:91`, `apps/api/src/modules/workflow/service.ts:132`  
  Reasoning: ownership/assignment checks exist for key flows; however, upload path construction bypass risk remains independent of object checks.

- Function-level authorization: **Pass**  
  Evidence: `apps/api/src/modules/workflow/service.ts:81`, `apps/api/src/modules/workflow/service.ts:99`, `apps/api/src/modules/admin/routes.ts:38`  
  Reasoning: sensitive operations (workflow decisions, hold release) require role and assignment state checks.

- Tenant/user data isolation: **Partial Pass**  
  Evidence: `apps/api/src/modules/researcher/routes.ts:371`, `apps/api/src/modules/workflow/service.ts:110`  
  Reasoning: logical object isolation checks are present. No multi-tenant model is documented; isolation conclusions are per-user role/object scope.

- Admin/internal/debug protection: **Pass**  
  Evidence: `apps/api/src/modules/admin/routes.ts:17`, `apps/api/src/modules/admin/routes.ts:26`, `apps/api/src/modules/health/routes.ts:5`  
  Reasoning: admin routes are guarded; health endpoint intentionally public.

## 7. Tests and Logging Review

- Unit tests: **Pass (static presence and breadth)**  
  Evidence: `apps/api/vitest.config.ts:3`, `apps/api/tests/auth-service.test.ts:1`, `apps/api/tests/researcher-service.test.ts:1`, `apps/web/tests/auth-utils.test.ts:1`

- API/integration tests: **Partial Pass**  
  Evidence: `apps/api/tests/researcher-routes.test.ts:92`, `apps/api/tests/workflow-routes.test.ts:320`, `apps/api/tests/finance-routes.test.ts:65`, `apps/web/tests/integrated-flows.spec.ts:1`  
  Reasoning: many role/boundary flows covered, but high-risk upload path traversal and concurrency cap races are not covered.

- Logging categories/observability: **Pass**  
  Evidence: `apps/api/src/lib/logger.ts:7`, `apps/api/src/plugins/error-envelope.ts:28`, `apps/api/tests/logger-redaction.test.ts:32`

- Sensitive-data leakage risk in logs/responses: **Partial Pass**  
  Evidence: `apps/api/src/lib/logger.ts:21`, `apps/api/src/modules/finance/service.ts:37`, `apps/api/src/modules/finance/service.ts:579`, `apps/api/tests/logger-redaction.test.ts:95`  
  Reasoning: explicit redaction + refund response masking are present; static-only review cannot fully prove all operational log paths.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit/API tests exist via Vitest.
  - API config: `apps/api/vitest.config.ts:3`
  - Web config: `apps/web/vite.config.ts:1` (test mode in Vite/Vitest config)
- E2E-style tests exist via Playwright.
  - `apps/web/playwright.config.ts:6`
  - `apps/web/tests/integrated-flows.spec.ts:1`
- Test commands are documented and scripted.
  - `README.md:195`, `README.md:237`, `package.json:12`, `apps/api/package.json:11`, `apps/web/package.json:12`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Auth lockout after 5 failures, 15-minute policy config | `apps/api/tests/auth-service.test.ts:264` | expects lockout + `AUTH_LOCKOUT_TRIGGERED` (`apps/api/tests/auth-service.test.ts:316`) | basically covered | No direct time-advance unlock path | Add test for unlock after lockout interval boundary |
| 401 unauthenticated / 403 unauthorized route boundaries | `apps/api/tests/access-control.test.ts:13`, `apps/api/tests/finance-routes.test.ts:65` | explicit status assertions (`...:30`, `...:88`) | sufficient | Not every route family enumerated | Add table-driven guard tests for all top-level route groups |
| Researcher object-level ownership | `apps/api/tests/researcher-routes.test.ts:92`, `apps/api/tests/researcher-routes.test.ts:106` | 403 on other user app/doc reads (`...:103`, `...:117`) | basically covered | Does not cover upload path abuse | Add upload tests with malicious `documentKey` values |
| Workflow assignment/object authorization | `apps/api/tests/workflow-routes.test.ts:309` | approver non-assigned receives 403 (`...:320`) | basically covered | Limited negative cases for document access permutations | Add tests for reviewer/approver doc access mismatch matrix |
| Required docs/duplicate/cap/deadline validations | `apps/api/tests/researcher-service.test.ts:256`, `apps/api/tests/researcher-routes.test.ts:120` | extension usage + duplicate conflict checks (`...:274`, `...:140`) | basically covered | No concurrency test around annual cap/version races | Add transactional concurrency simulation tests |
| 20-version document cap | `apps/api/tests/researcher-service.test.ts:280` | expects `DOCUMENT_VERSION_LIMIT_REACHED` (`...:313`) | insufficient | Single-threaded check only; non-atomic race untested | Add parallel upload test asserting cap remains <=20 under contention |
| Upload security scanning (MIME/sensitive pattern hold/warn) | `apps/api/tests/researcher-service.test.ts:334`, `apps/api/tests/journal-governance-service.test.ts:1` | warning findings asserted (`...:357`) | basically covered | No researcher `documentKey` sanitization/path traversal test | Add path canonicalization tests (reject `../`, absolute paths) |
| Offline finance flow (invoice/payment/refund/reconciliation/exception lifecycle) | `apps/api/tests/finance-service.test.ts:1`, `apps/api/tests/finance-routes.test.ts:91` | service in-memory ledger/reconciliation mocks + RBAC assertions | basically covered | Money-format strictness and malformed inputs under-tested | Add API schema tests for invalid decimal formats |
| Encryption-at-rest and masked response for bank fields | `apps/api/tests/finance-service.test.ts:2` | decrypt helper imported and refund sanitization flow exercised | basically covered | No explicit assertion for all response surfaces | Add explicit response contract test proving encrypted fields never returned |
| Logging redaction | `apps/api/tests/logger-redaction.test.ts:59` | asserts secret tokens not present in serialized logs (`...:96`) | sufficient | Focused on selected fields; may miss future additions | Add regression test generated from central sensitive-key list |

### 8.3 Security Coverage Audit
- Authentication: **Basically covered**  
  Evidence: `apps/api/tests/auth-service.test.ts:264`, `apps/api/tests/auth-routes.test.ts:1`
- Route authorization: **Covered for key slices**  
  Evidence: `apps/api/tests/access-control.test.ts:13`, `apps/api/tests/finance-routes.test.ts:71`, `apps/api/tests/admin-routes.test.ts:70`
- Object-level authorization: **Partially covered**  
  Evidence: `apps/api/tests/researcher-routes.test.ts:92`, `apps/api/tests/workflow-routes.test.ts:320`
- Tenant/data isolation: **Cannot Confirm Statistically (full)**  
  Evidence: no explicit multi-tenant model/tests; per-user checks exist in selected tests.
- Admin/internal protection: **Covered**  
  Evidence: `apps/api/tests/admin-routes.test.ts:70`
- Key untested severe area: upload path traversal risk remains undetected by current tests.

### 8.4 Final Coverage Judgment
**Partial Pass**

- Covered major risks: auth lockout, 401/403 boundaries, core workflow authorization paths, finance RBAC and lifecycle, log redaction.
- Uncovered high-impact risks: filesystem path traversal via upload key and concurrency-safe enforcement of version cap.
- Result: tests could still pass while severe security/consistency defects remain.

## 9. Final Notes
- This report is strictly static and evidence-based; runtime claims are intentionally avoided.
- The repository is broadly complete and well-structured, but acceptance should be blocked until high-severity upload path safety and version-cap race conditions are fixed.
