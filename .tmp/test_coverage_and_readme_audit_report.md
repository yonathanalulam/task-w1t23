# Test Coverage Audit

## Backend Endpoint Inventory

Resolved prefix chain:

- `/api/v1` from `apps/api/src/app.ts:70`
- module prefixes from `apps/api/src/modules/index.ts:124-133`

Total resolved endpoints: **77**

- Health (1)
  - `GET /api/v1/health`
- Auth (6)
  - `GET /api/v1/auth/password-policy`
  - `POST /api/v1/auth/bootstrap-admin`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/change-password`
- Policies (5)
  - `GET /api/v1/policies`
  - `GET /api/v1/policies/:policyId`
  - `POST /api/v1/policies`
  - `PATCH /api/v1/policies/:policyId`
  - `DELETE /api/v1/policies/:policyId`
- Researcher (14)
  - `POST /api/v1/researcher/applications`
  - `GET /api/v1/researcher/applications`
  - `GET /api/v1/researcher/applications/:applicationId`
  - `POST /api/v1/researcher/applications/:applicationId/submit`
  - `POST /api/v1/researcher/applications/:applicationId/resubmit`
  - `POST /api/v1/researcher/applications/:applicationId/documents/file`
  - `POST /api/v1/researcher/applications/:applicationId/documents/link`
  - `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/versions`
  - `POST /api/v1/researcher/applications/:applicationId/documents/:documentId/rollback/:versionId`
  - `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/preview`
  - `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/download`
  - `POST /api/v1/researcher/applications/:applicationId/extensions`
  - `GET /api/v1/researcher/applications/:applicationId/status-history`
  - `GET /api/v1/researcher/applications/:applicationId/validations`
- Workflow (10)
  - `GET /api/v1/workflow/reviewer/queue`
  - `GET /api/v1/workflow/reviewer/applications/:applicationId`
  - `GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/preview`
  - `GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/download`
  - `POST /api/v1/workflow/reviewer/applications/:applicationId/decision`
  - `GET /api/v1/workflow/approver/queue`
  - `GET /api/v1/workflow/approver/applications/:applicationId`
  - `GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/preview`
  - `GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/download`
  - `POST /api/v1/workflow/approver/applications/:applicationId/sign-off`
- Journal governance (13)
  - `GET /api/v1/journal-governance/custom-fields`
  - `POST /api/v1/journal-governance/custom-fields`
  - `PATCH /api/v1/journal-governance/custom-fields/:fieldId`
  - `GET /api/v1/journal-governance/journals`
  - `POST /api/v1/journal-governance/journals`
  - `GET /api/v1/journal-governance/journals/:journalId`
  - `PATCH /api/v1/journal-governance/journals/:journalId`
  - `DELETE /api/v1/journal-governance/journals/:journalId`
  - `GET /api/v1/journal-governance/journals/:journalId/history`
  - `POST /api/v1/journal-governance/journals/:journalId/attachments/file`
  - `POST /api/v1/journal-governance/journals/:journalId/attachments/link`
  - `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/versions`
  - `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/download`
- Resource booking (9)
  - `GET /api/v1/resource-booking/manager/resources`
  - `POST /api/v1/resource-booking/manager/resources`
  - `GET /api/v1/resource-booking/manager/resources/:resourceId`
  - `PATCH /api/v1/resource-booking/manager/resources/:resourceId`
  - `PUT /api/v1/resource-booking/manager/resources/:resourceId/business-hours`
  - `POST /api/v1/resource-booking/manager/resources/:resourceId/blackouts`
  - `GET /api/v1/resource-booking/researcher/availability`
  - `GET /api/v1/resource-booking/researcher/bookings`
  - `POST /api/v1/resource-booking/researcher/bookings`
- Recommendations (5)
  - `GET /api/v1/recommendations/researcher`
  - `GET /api/v1/recommendations/researcher/preferences`
  - `PUT /api/v1/recommendations/researcher/preferences`
  - `GET /api/v1/recommendations/researcher/feedback`
  - `POST /api/v1/recommendations/researcher/feedback`
- Finance (10)
  - `GET /api/v1/finance/invoices`
  - `POST /api/v1/finance/invoices`
  - `GET /api/v1/finance/invoices/:invoiceId`
  - `POST /api/v1/finance/invoices/:invoiceId/payments`
  - `POST /api/v1/finance/invoices/:invoiceId/refunds`
  - `POST /api/v1/finance/reconciliation/import-csv`
  - `GET /api/v1/finance/reconciliation/queue`
  - `POST /api/v1/finance/reconciliation/exceptions/:rowId/resolve`
  - `POST /api/v1/finance/reconciliation/exceptions/:rowId/close`
  - `GET /api/v1/finance/ledger`
- Admin (4)
  - `GET /api/v1/admin/ping`
  - `GET /api/v1/admin/upload-holds`
  - `POST /api/v1/admin/upload-holds/researcher-documents/:versionId/release`
  - `POST /api/v1/admin/upload-holds/journal-attachments/:versionId/release`

## API Test Mapping Table

| Endpoint | covered | test type | test files | evidence |
|---|---|---|---|---|
| GET /api/v1/health | yes | true no-mock HTTP | `apps/api/tests/health.test.ts` | `describe('GET /api/v1/health')` |
| GET /api/v1/auth/password-policy | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns the password policy description on GET /api/v1/auth/password-policy...')` |
| POST /api/v1/auth/bootstrap-admin | yes | true no-mock HTTP | `apps/api/tests/auth-routes.test.ts` | `it('supports bootstrap, login...')` |
| POST /api/v1/auth/login | yes | true no-mock HTTP | `apps/api/tests/auth-routes.test.ts` | `it('supports bootstrap, login...')` |
| POST /api/v1/auth/logout | yes | true no-mock HTTP | `apps/api/tests/auth-routes.test.ts` | `it('supports bootstrap...logout...')` |
| GET /api/v1/auth/me | yes | true no-mock HTTP | `apps/api/tests/auth-routes.test.ts` | `it('supports bootstrap...me...')` |
| POST /api/v1/auth/change-password | yes | true no-mock HTTP | `apps/api/tests/auth-routes.test.ts` | `it('supports bootstrap...change-password...')` |
| GET /api/v1/policies | yes | true no-mock HTTP | `apps/api/tests/policies-routes.test.ts` | `it('allows authenticated viewing of policies')` |
| GET /api/v1/policies/:policyId | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns a policy via GET /api/v1/policies/:policyId...')` |
| POST /api/v1/policies | yes | true no-mock HTTP | `apps/api/tests/policies-routes.test.ts` | `it('allows admin creation and update of policies')` |
| PATCH /api/v1/policies/:policyId | yes | true no-mock HTTP | `apps/api/tests/policies-routes.test.ts` | `it('allows admin creation and update of policies')` |
| DELETE /api/v1/policies/:policyId | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('deletes a policy via DELETE /api/v1/policies/:policyId...')` |
| POST /api/v1/researcher/applications | yes | true no-mock HTTP | `apps/api/tests/researcher-routes.test.ts` | `it('submits an application end-to-end...')` |
| GET /api/v1/researcher/applications | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('lists researcher applications via GET /api/v1/researcher/applications')` |
| GET /api/v1/researcher/applications/:applicationId | yes | true no-mock HTTP | `apps/api/tests/researcher-routes.test.ts` | `it('returns 403 when another researcher accesses someone else application')` |
| POST /api/v1/researcher/applications/:applicationId/submit | yes | true no-mock HTTP | `apps/api/tests/researcher-routes.test.ts` | `it('submits an application end-to-end...')` |
| POST /api/v1/researcher/applications/:applicationId/resubmit | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 404 on POST /api/v1/researcher/applications/:id/resubmit...')` |
| POST /api/v1/researcher/applications/:applicationId/documents/file | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 400 on POST /api/v1/researcher/applications/:id/documents/file...')` |
| POST /api/v1/researcher/applications/:applicationId/documents/link | yes | true no-mock HTTP | `apps/api/tests/researcher-routes.test.ts` | helper `addRequiredLink` in submit flow |
| GET /api/v1/researcher/applications/:applicationId/documents/:documentId/versions | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns document versions via GET .../versions...')` |
| POST /api/v1/researcher/applications/:applicationId/documents/:documentId/rollback/:versionId | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 409 on POST .../rollback/:versionId...')` |
| GET /api/v1/researcher/applications/:applicationId/documents/:documentId/preview | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 415 on GET .../preview...')` |
| GET /api/v1/researcher/applications/:applicationId/documents/:documentId/download | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('downloads a researcher link document via GET .../download')` |
| POST /api/v1/researcher/applications/:applicationId/extensions | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('grants an extension via POST .../extensions...')` |
| GET /api/v1/researcher/applications/:applicationId/status-history | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns status history + validations via GET .../status-history...')` |
| GET /api/v1/researcher/applications/:applicationId/validations | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | same `it(...)` |
| GET /api/v1/workflow/reviewer/queue | yes | true no-mock HTTP | `apps/api/tests/workflow-routes.test.ts` | `it('preserves persisted reviewer access...')` |
| GET /api/v1/workflow/reviewer/applications/:applicationId | yes | true no-mock HTTP | `apps/api/tests/workflow-routes.test.ts` | `assignedDetail` request in same `it(...)` |
| GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/preview | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 403 for workflow reviewer preview/download...')` |
| GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/download | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | same `it(...)` |
| POST /api/v1/workflow/reviewer/applications/:applicationId/decision | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('processes reviewer decision via POST .../decision...')` |
| GET /api/v1/workflow/approver/queue | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 200 empty queue on GET /api/v1/workflow/approver/queue...')` |
| GET /api/v1/workflow/approver/applications/:applicationId | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 403 for approver detail endpoint...')` |
| GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/preview | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 403 for workflow approver preview/download...')` |
| GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/download | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | same `it(...)` |
| POST /api/v1/workflow/approver/applications/:applicationId/sign-off | yes | true no-mock HTTP | `apps/api/tests/endpoint-coverage-supplemental.test.ts` | `it('returns 403/404 on POST .../sign-off...')` |
| GET /api/v1/journal-governance/custom-fields | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | `it('supports full journal custom-field lifecycle...')` |
| POST /api/v1/journal-governance/custom-fields | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| PATCH /api/v1/journal-governance/custom-fields/:fieldId | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| GET /api/v1/journal-governance/journals | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | `it('supports journal lifecycle via POST/GET/PATCH/DELETE...')` |
| POST /api/v1/journal-governance/journals | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| GET /api/v1/journal-governance/journals/:journalId | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| PATCH /api/v1/journal-governance/journals/:journalId | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| DELETE /api/v1/journal-governance/journals/:journalId | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| GET /api/v1/journal-governance/journals/:journalId/history | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| POST /api/v1/journal-governance/journals/:journalId/attachments/file | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | `it('returns 400 on POST .../attachments/file...')` |
| POST /api/v1/journal-governance/journals/:journalId/attachments/link | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | `it('supports journal link attachment + versions + download...')` |
| GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/versions | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/download | yes | true no-mock HTTP | `apps/api/tests/journal-governance-integration.test.ts` | same `it(...)` |
| GET /api/v1/resource-booking/manager/resources | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | `it('covers full manager resource lifecycle...')` |
| POST /api/v1/resource-booking/manager/resources | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| GET /api/v1/resource-booking/manager/resources/:resourceId | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| PATCH /api/v1/resource-booking/manager/resources/:resourceId | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| PUT /api/v1/resource-booking/manager/resources/:resourceId/business-hours | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| POST /api/v1/resource-booking/manager/resources/:resourceId/blackouts | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| GET /api/v1/resource-booking/researcher/availability | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | `it('supports researcher availability + bookings via ...')` |
| GET /api/v1/resource-booking/researcher/bookings | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| POST /api/v1/resource-booking/researcher/bookings | yes | true no-mock HTTP | `apps/api/tests/resource-booking-integration.test.ts` | same `it(...)` |
| GET /api/v1/recommendations/researcher | yes | true no-mock HTTP | `apps/api/tests/recommendations-integration.test.ts` | `it('returns structured recommendations envelope...')` |
| GET /api/v1/recommendations/researcher/preferences | yes | true no-mock HTTP | `apps/api/tests/recommendations-integration.test.ts` | `it('supports preferences GET/PUT...')` |
| PUT /api/v1/recommendations/researcher/preferences | yes | true no-mock HTTP | `apps/api/tests/recommendations-integration.test.ts` | same `it(...)` |
| GET /api/v1/recommendations/researcher/feedback | yes | true no-mock HTTP | `apps/api/tests/recommendations-integration.test.ts` | `it('lists empty feedback via GET .../feedback...')` |
| POST /api/v1/recommendations/researcher/feedback | yes | true no-mock HTTP | `apps/api/tests/recommendations-integration.test.ts` | `it('records feedback via POST .../feedback...')` |
| GET /api/v1/finance/invoices | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | `it('supports invoice lifecycle: POST/GET ...')` |
| POST /api/v1/finance/invoices | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| GET /api/v1/finance/invoices/:invoiceId | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| POST /api/v1/finance/invoices/:invoiceId/payments | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | `it('records payments + refunds via POST ...')` |
| POST /api/v1/finance/invoices/:invoiceId/refunds | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| POST /api/v1/finance/reconciliation/import-csv | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | `it('imports settlement CSV and exposes queue...')` |
| GET /api/v1/finance/reconciliation/queue | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| POST /api/v1/finance/reconciliation/exceptions/:rowId/resolve | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| POST /api/v1/finance/reconciliation/exceptions/:rowId/close | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | same `it(...)` |
| GET /api/v1/finance/ledger | yes | true no-mock HTTP | `apps/api/tests/finance-integration.test.ts` | `it('lists ledger via GET /api/v1/finance/ledger...')` |
| GET /api/v1/admin/ping | yes | true no-mock HTTP | `apps/api/tests/admin-integration.test.ts` | `it('returns {ok:true,area:"admin"} for administrator...')` |
| GET /api/v1/admin/upload-holds | yes | true no-mock HTTP | `apps/api/tests/admin-integration.test.ts` | `it('returns both hold lists on GET /api/v1/admin/upload-holds...')` |
| POST /api/v1/admin/upload-holds/researcher-documents/:versionId/release | yes | true no-mock HTTP | `apps/api/tests/admin-integration.test.ts` | `it('returns 404 on POST ...researcher-documents.../release...')` |
| POST /api/v1/admin/upload-holds/journal-attachments/:versionId/release | yes | true no-mock HTTP | `apps/api/tests/admin-integration.test.ts` | `it('returns 404 on POST ...journal-attachments.../release...')` |

## API Test Classification

1. True No-Mock HTTP

- `apps/api/tests/health.test.ts`
- `apps/api/tests/auth-routes.test.ts`
- `apps/api/tests/policies-routes.test.ts`
- `apps/api/tests/researcher-routes.test.ts`
- `apps/api/tests/workflow-routes.test.ts`
- `apps/api/tests/journal-governance-integration.test.ts`
- `apps/api/tests/resource-booking-integration.test.ts`
- `apps/api/tests/recommendations-integration.test.ts`
- `apps/api/tests/finance-integration.test.ts`
- `apps/api/tests/admin-integration.test.ts`
- `apps/api/tests/endpoint-coverage-supplemental.test.ts`

2. HTTP with Mocking

- `apps/api/tests/finance-routes.test.ts`
- `apps/api/tests/admin-routes.test.ts`
- `apps/api/tests/recommendations-routes.test.ts`
- `apps/api/tests/resource-booking-routes.test.ts`
- `apps/api/tests/journal-governance-routes.test.ts`

3. Non-HTTP (unit/integration without HTTP)

- `apps/api/tests/auth-service.test.ts`
- `apps/api/tests/researcher-service.test.ts`
- `apps/api/tests/workflow-service.test.ts`
- `apps/api/tests/journal-governance-service.test.ts`
- `apps/api/tests/resource-booking-service.test.ts`
- `apps/api/tests/recommendations-service.test.ts`
- `apps/api/tests/finance-service.test.ts`
- `apps/api/tests/password-policy.test.ts`
- `apps/api/tests/researcher-rules.test.ts`
- `apps/api/tests/access-control.test.ts`
- `apps/api/tests/logger-redaction.test.ts`

## Mock Detection Rules Findings

- `apps/api/tests/finance-routes.test.ts:21-37`: mocked `audit` and `financeService` (`vi.fn`).
- `apps/api/tests/admin-routes.test.ts:21-37`: mocked `audit`, `researcherRepository`, `journalGovernanceRepository`.
- `apps/api/tests/recommendations-routes.test.ts:21-70`: mocked `audit` and `recommendationsService`.
- `apps/api/tests/resource-booking-routes.test.ts:21-38`: mocked `audit` and `resourceBookingService`.
- `apps/api/tests/journal-governance-routes.test.ts:21-45`: mocked `audit`, `journalGovernanceService`, `journalGovernanceRepository`.
- Service/unit tests use mock/stub repositories/providers (`vi.fn`) and bypass HTTP layer:
  - `apps/api/tests/auth-service.test.ts`
  - `apps/api/tests/researcher-service.test.ts`
  - `apps/api/tests/workflow-service.test.ts`
  - `apps/api/tests/journal-governance-service.test.ts`
  - `apps/api/tests/resource-booking-service.test.ts`
  - `apps/api/tests/recommendations-service.test.ts`
  - `apps/api/tests/finance-service.test.ts`

## Coverage Summary

- Total endpoints: **77**
- Endpoints with HTTP tests: **77**
- Endpoints with TRUE no-mock tests: **77**
- HTTP coverage %: **100.00%**
- True API coverage %: **100.00%**

## Unit Test Summary

Unit/non-HTTP files:

- `apps/api/tests/auth-service.test.ts`
- `apps/api/tests/researcher-service.test.ts`
- `apps/api/tests/workflow-service.test.ts`
- `apps/api/tests/journal-governance-service.test.ts`
- `apps/api/tests/resource-booking-service.test.ts`
- `apps/api/tests/recommendations-service.test.ts`
- `apps/api/tests/finance-service.test.ts`
- `apps/api/tests/password-policy.test.ts`
- `apps/api/tests/researcher-rules.test.ts`
- `apps/api/tests/access-control.test.ts`
- `apps/api/tests/logger-redaction.test.ts`

Modules covered by unit tests:

- controllers/routes: secondary coverage through mocked route tests.
- services: auth/researcher/workflow/journal/resource-booking/recommendations/finance.
- repositories: mostly indirect through service mocks; direct repository tests not evident.
- auth/guards/middleware: guards, password policy, logger redaction, error envelope behavior.

Important modules not directly unit-tested:

- Concrete repository implementations under `apps/api/src/modules/*/repository.ts`.
- DB access helpers under `apps/api/src/lib/db.ts` (no direct test file found).

## Tests Check

- Success paths: broad and present across all domains, including full route lifecycles for finance/journal/resource-booking.
- Failure cases: present (401/403/404/409/415/400) for auth, RBAC, validation, and not-found conditions.
- Edge cases: present but uneven; some endpoints are covered only by negative-path assertions.
- Validation/auth/permissions: strong in route-level tests.
- Integration boundaries: strong true integration breadth (`buildApiApp` + DB helper) across modules.
- Assertion depth: mixed; several tests use flexible status assertions (`[403,404]`, `[200,400,409]`) which weakens strict behavioral guarantees.
- `run_tests.sh`: Docker-based (`docker compose` in `run_tests.sh:19-26`) => **OK**.
- End-to-end expectation (fullstack): FE<->BE e2e exists (`apps/web/tests/integrated-flows.spec.ts`), plus API integration coverage is now broad.

## Test Coverage Score (0–100)

**90 / 100**

## Score Rationale

- Endpoint coverage and true no-mock coverage are complete by static evidence (77/77).
- Deductions remain for quality consistency: several endpoint tests assert only status or allow multiple status codes, reducing determinism and sufficiency confidence.
- Over-mocked tests still exist (acceptable as secondary checks, but not ideal as primary quality signal).

## Key Gaps

- Some route tests still use permissive assertions instead of exact expected outcomes.
- Several endpoints are covered only by failure-path checks; success-path coverage is not uniformly present per endpoint.
- Repository implementation logic remains mostly untested directly.

## Confidence & Assumptions

- Confidence: **high** for endpoint count and endpoint-to-test mapping (static file inspection).
- Assumption: any exact request to fully resolved `METHOD + /api/v1/...` counts as endpoint covered, including expected failure responses.
- No runtime execution performed.

# README Audit

## Project Type Detection

- Declared at top: **yes** (`README.md:3`) as fullstack.
- Inferred type: **fullstack** (API + web structure, `README.md:3`, `README.md:224-226`).

## README Location

- `repo/README.md`: **present**.

## Hard Gate Checks

### Formatting

- PASS: structured markdown with clear sections and command blocks (`README.md:1-325`).

### Startup Instructions (backend/fullstack requires `docker-compose up`)

- PASS: explicit `docker-compose up --build` command included (`README.md:14`).

### Access Method

- PASS: URL/port access guidance provided (`README.md:21-38`).

### Verification Method

- PASS: API curl, UI login verification, and `./run_tests.sh` guidance included (`README.md:49-64`).

### Environment Rules (strict Docker-contained; no runtime installs/manual setup)

- PASS: no host-native runtime install/setup instructions remain in project README; Docker-contained flow is maintained (`README.md:7-64`, `README.md:239-245`, `README.md:318-325`).

### Demo Credentials (auth exists)

- PASS: credentials for all roles are provided (`README.md:66-77`), with deterministic seeding command (`README.md:39-47`).

## Engineering Quality

- Tech stack clarity: strong (`README.md:3`, `README.md:224-229`).
- Architecture/workflow clarity: strong endpoint and slice notes (`README.md:117-316`).
- Testing instructions: strong Docker-first instructions (`README.md:60-64`, `README.md:241-245`).
- Security/roles clarity: strong role and secret handling documentation (`README.md:66-79`, `README.md:247-253`).
- Presentation quality: high, concise, and now aligned with strict Docker-first compliance.

## High Priority Issues

- None.

## Medium Priority Issues

- None.

## Low Priority Issues

- None.

## Hard Gate Failures

- None.

## README Verdict (PASS / PARTIAL PASS / FAIL)

**PASS**

Reason: all strict hard gates are satisfied in the current README.
