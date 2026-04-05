# Research Resource & Grant Administration (RRGA)

Slice 8 adds a real finance-clerk vertical slice on top of auth/submission/workflow/journal governance/resource booking/recommendations: offline invoices, offline WeChat reference capture, refunds (full/partial), settlement CSV reconciliation, exception queue, and ledger traceability.

## Current implementation status

Implemented in this stage:

- Monorepo foundations (`apps/api`, `apps/web`, `packages/shared`)
- Fastify + TypeScript API with offline auth/RBAC/audit baseline plus researcher/workflow, journal governance, resource booking, recommendations, and finance slices:
  - `GET /api/v1/health`
  - `POST /api/v1/auth/bootstrap-admin` (first-user bootstrap only)
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/change-password`
  - `GET /api/v1/admin/ping` (administrator-only RBAC check route)
  - `GET/POST/PATCH/DELETE /api/v1/policies`
  - `POST /api/v1/researcher/applications`
  - `GET /api/v1/researcher/applications`
  - `GET /api/v1/researcher/applications/:id`
  - `POST /api/v1/researcher/applications/:id/submit`
  - `POST /api/v1/researcher/applications/:id/resubmit`
  - `POST /api/v1/researcher/applications/:id/documents/file`
  - `POST /api/v1/researcher/applications/:id/documents/link`
  - `GET /api/v1/researcher/applications/:id/documents/:documentId/versions`
  - `POST /api/v1/researcher/applications/:id/documents/:documentId/rollback/:versionId`
  - `GET /api/v1/researcher/applications/:id/documents/:documentId/preview`
  - `GET /api/v1/researcher/applications/:id/documents/:documentId/download`
  - `POST /api/v1/researcher/applications/:id/extensions` (administrator-only one-time extension)
  - `GET /api/v1/workflow/reviewer/queue`
  - `GET /api/v1/workflow/reviewer/applications/:id`
  - `POST /api/v1/workflow/reviewer/applications/:id/decision`
  - `GET /api/v1/workflow/approver/queue`
  - `GET /api/v1/workflow/approver/applications/:id`
  - `POST /api/v1/workflow/approver/applications/:id/sign-off`
  - `GET/POST /api/v1/journal-governance/custom-fields`
  - `PATCH /api/v1/journal-governance/custom-fields/:fieldId`
  - `GET/POST /api/v1/journal-governance/journals`
  - `GET/PATCH/DELETE /api/v1/journal-governance/journals/:journalId`
  - `GET /api/v1/journal-governance/journals/:journalId/history`
  - `POST /api/v1/journal-governance/journals/:journalId/attachments/file`
  - `POST /api/v1/journal-governance/journals/:journalId/attachments/link`
  - `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/versions`
  - `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/download`
  - `GET /api/v1/resource-booking/manager/resources`
  - `POST /api/v1/resource-booking/manager/resources`
  - `GET /api/v1/resource-booking/manager/resources/:resourceId`
  - `PATCH /api/v1/resource-booking/manager/resources/:resourceId`
  - `PUT /api/v1/resource-booking/manager/resources/:resourceId/business-hours`
  - `POST /api/v1/resource-booking/manager/resources/:resourceId/blackouts`
  - `GET /api/v1/resource-booking/researcher/availability`
  - `GET /api/v1/resource-booking/researcher/bookings`
  - `POST /api/v1/resource-booking/researcher/bookings`
  - `GET /api/v1/recommendations/researcher`
  - `GET /api/v1/recommendations/researcher/preferences`
  - `PUT /api/v1/recommendations/researcher/preferences`
  - `GET /api/v1/recommendations/researcher/feedback`
  - `POST /api/v1/recommendations/researcher/feedback`
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
   - `GET /api/v1/admin/upload-holds`
   - `POST /api/v1/admin/upload-holds/researcher-documents/:versionId/release`
   - `POST /api/v1/admin/upload-holds/journal-attachments/:versionId/release`
   - `GET /api/v1/workflow/reviewer/applications/:id/documents/:documentId/preview`
   - `GET /api/v1/workflow/reviewer/applications/:id/documents/:documentId/download`
   - `GET /api/v1/workflow/approver/applications/:id/documents/:documentId/preview`
   - `GET /api/v1/workflow/approver/applications/:id/documents/:documentId/download`
  - shared JSON error envelope
  - structured logging with sensitive-field redaction
- SvelteKit + TypeScript web auth + multi-role role-workspace surfaces:
  - `/login`
  - `/forbidden`
  - role-protected routes `/researcher`, `/researcher/applications/[id]`, `/researcher/resources`, `/researcher/recommendations`, `/reviewer`, `/reviewer/applications/[id]`, `/approver`, `/approver/applications/[id]`, `/manager`, `/manager/resources/[resourceId]`, `/finance`, `/finance/invoices/[invoiceId]`, `/admin`, `/admin/journals`, `/admin/journals/[journalId]`
- PostgreSQL tables/migrations for auth, researcher/workflow, and journal governance (custom field definitions, journal versions, attachment versions)
- Docker-first runtime wrapper (`./run_app.sh up`, which runs `docker compose up --build`)
- Broad Dockerized test wrapper (`./run_tests.sh`)

Hardening delivered in this stage:

- upload security depth for researcher/journal file flows:
  - server-side MIME sniffing
  - executable filename/content blocking
  - archive expansion safety checks
  - sensitive-pattern detection with warning/hold metadata
- explicit finance exception lifecycle:
  - open exception queue + resolved/closed history
  - finance-clerk resolve/close actions
  - ledger/audit trace for exception resolution actions

## Role surfaces at a glance

- Researcher: `/researcher`, `/researcher/applications/[id]`, `/researcher/resources`, `/researcher/recommendations`
- Reviewer: `/reviewer`, `/reviewer/applications/[id]`
- Approver: `/approver`, `/approver/applications/[id]`
- Resource manager: `/manager`, `/manager/resources/[resourceId]`
- Finance clerk: `/finance`, `/finance/invoices/[invoiceId]`
- Administrator: `/admin`, `/admin/journals`, `/admin/journals/[journalId]`

## Offline scope clarifications

- Authentication and role flows are local/offline (no external identity provider).
- Finance handling is offline-only in this slice:
  - no live WeChat gateway API calls
  - no webhook ingestion
  - transaction references are manually recorded external identifiers
  - settlement reconciliation is CSV import based

## Repository layout

- `apps/api` — Fastify backend service
- `apps/web` — SvelteKit frontend service
- `packages/shared` — shared cross-app types
- the repository remains understandable from this README, source tree, scripts, and in-code route/module structure.
- `init_db.sh` — **only** project-standard DB initialization path
- `run_tests.sh` — broad Dockerized test wrapper

## Runtime (primary)

Primary runtime contract for this repo is:

```bash
./run_app.sh up
```

This wrapper is Docker-first underneath and is the supported operational path because it keeps runtime credentials/secrets and project naming consistent across later invocations (`ps`, `logs`, `down`, `url`) without `.env` files.

Direct `docker compose up --build` is still available for advanced/manual usage when all required runtime env vars are explicitly supplied, but it is not the primary user-facing contract.

Underlying Docker command used by wrapper:

```bash
docker compose up --build
```

Collision-safe defaults:

- no `container_name` usage
- unique Compose project naming path via `name: ${COMPOSE_PROJECT_NAME:-rrga_${USER:-local}}`
- only web app port exposed to host
- host binding is localhost only (`127.0.0.1`)
- random host port by default

Fixed-port override with fallback:

```bash
APP_PORT=4173 ./run_app.sh up
```

- If requested port is available, wrapper uses it.
- If requested port is unavailable, wrapper falls back to a random localhost port and prints the resolved UI URL.

Operational follow-up commands (consistent across shells):

```bash
./run_app.sh ps
./run_app.sh logs
./run_app.sh logs-follow
./run_app.sh url
./run_app.sh down
```

## Runtime database/config inputs

- Database credentials/bootstrap values are provided at runtime only (env or `*_FILE` secret paths), never hardcoded.
- `./run_app.sh` persists runtime values under `.runtime/` for stable follow-up operations.
- `./run_tests.sh` uses isolated ephemeral runtime values per test run.
- API config also supports env-or-file loading for DB/app secrets.

## Database initialization contract

Use `./init_db.sh` for all DB setup/migration application. Runtime and broad tests route through this script.

```bash
./init_db.sh
```

## Broad test path (owner gate)

```bash
./run_tests.sh
```

This is Dockerized and invokes `./init_db.sh` before tests.

## Local non-Docker iteration commands

```bash
npm install
source ./scripts/runtime_env.sh && setup_runtime_env_persistent "$(pwd)"
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER="$RRGA_DB_USER" PGPASSWORD="$RRGA_DB_PASSWORD" PGDATABASE="$RRGA_DB_NAME"
npm run dev:api
npm run dev:web
npm run test:api
npm run test:web
npm run typecheck

# optional targeted runtime proof for extension-aware submit gating
WEB_URL="http://$(source ./scripts/runtime_env.sh && setup_runtime_env_persistent \"$(pwd)\" && docker compose port web 4173 | tr -d '\r')"
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_extension_ui.mjs

# optional targeted runtime proof for review + approval path
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_review_approval_ui.mjs

# optional targeted runtime proof for journal governance admin flow
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_journal_governance_ui.mjs

# optional targeted runtime proof for resource booking manager/researcher flow
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_resource_booking_ui.mjs

# optional targeted runtime proof for recommendations preference+feedback flow
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_recommendations_ui.mjs

# optional targeted runtime proof for finance invoice/reconciliation/refund flow
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_finance_ui.mjs

# targeted runtime proof for hardening surfaces (upload scan visibility + finance exception resolve/close UI)
VERIFY_BASE_URL="$WEB_URL" node scripts/verify_hardening_ui.mjs

# integrated Playwright UI flow coverage (submission, review/approval, booking, recommendations, finance)
./scripts/run_integrated_e2e.sh

# equivalent npm wrapper
npm run test:web:e2e:integrated
```

Integrated E2E artifacts are written under:

- `apps/web/test-results/` (checkpoint screenshots + trace/error context)
- `apps/web/playwright-report/` (Playwright HTML report when generated)

## Auth bootstrap for first local login

When the database has no users yet, create the first administrator account:

```bash
curl -i -X POST http://127.0.0.1:<WEB_PORT>/session/bootstrap-admin \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"AdminPass1!"}'
```

After bootstrap, sign in at `/login`.

Password policy: minimum 10 chars, upper/lower/number/symbol.

## Submission and workflow slice notes

- Statuses implemented now: `DRAFT`, `SUBMITTED_ON_TIME`, `SUBMITTED_LATE`, `UNDER_REVIEW`, `BLOCKED_LATE`, `RETURNED_FOR_REVISION`, `APPROVED`, `REJECTED`
- Duplicate prevention: one application per researcher per policy period (`policy_id + applicant_user_id` uniqueness)
- Annual cap enforcement: evaluated at submit/resubmit with persisted validation records (`application_validations`)
- One-time extension: administrator can grant once per application; extension usage is tracked and consumed
- Deadline surface states to frontend: `on_time`, `late_grace`, `late_extension_open`, `blocked_no_extension`, `blocked_extension_consumed`, `blocked_extension_expired`
- Frontend submit/resubmit controls are gated by backend-provided `submissionAllowed` + message
- Document versions: max 20 versions per logical document key, rollback supported
- Researcher file versions now include server-side upload security metadata (`securityScanStatus`, `securityFindings`, `isAdminReviewRequired`)
- Preview support: PDF and image uploads only; non-previewable files still retain metadata and download path
- Reviewer flow: queue + detail + required-comment decision (`forward_to_approval`, `return_for_revision`, `reject`)
- Reviewer/approver detail now includes submitted document metadata with role-authorized preview/download links
- Eligibility evaluation path: reviewer decision records `review_eligibility` validation rows with explicit per-check reasons
- Approver flow: queue + detail + required-comment sign-off (`approve`/`reject`) with ordered level progression up to policy-configured max 3 levels
- Immutable review/approval trail: append-only `application_review_actions` enforced by DB trigger (no update/delete)
- Held submissions are enforced: held uploads do not satisfy required-template checks and are blocked from preview/download until admin release
- File download endpoints support watermark telemetry (`?watermark=true|false`): response headers include watermark label and mode; text-like files receive prefixed content watermark

## Journal governance slice notes

- Journal master data CRUD: create/read/update/soft-delete via admin-only API and UI surfaces
- Custom fields: admin-defined definitions (`TEXT`, `NUMBER`, `DATE`, `URL`, `BOOLEAN`, `SELECT`) with validation-driven values stored in JSONB (no schema migration per field)
- Journal version history: each create/update/delete writes immutable `journal_record_versions` snapshots with version numbers
- Attachment support: contracts/quotes/sample-issue/other categories, file or link storage, and per-attachment version history
- Attachment file uploads include server-side scan metadata and admin-review hold flags
- Journal attachment download route returns binary stream for files and metadata payload for link-backed versions; held attachments are blocked until released
- Governance mutations are RBAC-protected to `administrator` role only
- Admin workspace includes an upload hold queue and release actions for held researcher/journal versions

## Resource booking slice notes

- Resource manager surfaces own resource CRUD, per-resource business hours, and maintenance blackout windows
- Resource defaults: Mon–Fri `08:00–18:00` business hours at creation
- Researcher availability search returns capacity and blackout-aware window status for active resources
- Booking creation enforces business-hours boundaries, blackout overlap rejection, and capacity checks
- DB-level race protection: exclusion constraints on seat/time allocations reject overlap writes and map to user-facing booking conflict errors

## Recommendations slice notes

- Recommendation candidates are sourced from currently active domain records in:
  - journal catalog (`journal_records`)
  - funding programs (`funding_policies`)
  - resources (`resources`)
- Scoring is deterministic and explainable; each recommendation includes plain-language reason lines for why it ranked
- Researcher preference editing is persisted (`recommendation_user_preferences`)
- Researcher feedback is persisted (`recommendation_feedback`) with controls: `LIKE`, `NOT_INTERESTED`, `BLOCK`
- Blocked items are excluded from future recommendation results for that user
- Current recommendation quality is bounded by currently available domain metadata (title/description/publisher/custom fields/location/type); no implicit behavioral tracking model is used in this slice

## Finance slice notes

- Offline-only finance handling (no live WeChat gateway integration): clerk records external WeChat transaction references manually
- Invoice lifecycle implemented for paid services: issue invoice, record payments, record partial/full refunds, track unsettled amounts
- Bank-transfer refund sensitive values are encrypted at rest (`bank_routing_number_encrypted`, `bank_account_number_encrypted`)
- Finance API responses sanitize encrypted bank fields from client payloads (ciphertext remains at-rest only)
- Settlement reconciliation imports CSV rows (`wechatTransactionRef,amount,settledAt`) and classifies rows as matched/unmatched/mismatch/duplicate/invalid
- Exception queue supports explicit finance-clerk resolve/close actions with required notes
- Queue includes open exceptions plus recently resolved/closed exception history
- Ledger trail (`finance_ledger_entries`) records who did what and when for invoice/payment/refund/reconciliation events

## Secret/config handling (no `.env` files)

- `.env` files are not used or committed in this repo.
- Runtime secrets/config are read from process environment variables or `*_FILE` paths (Docker secret-compatible).
- `./run_app.sh` keeps persistent runtime values in `.runtime/` to preserve operational consistency across invocations.
