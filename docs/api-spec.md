# API Spec (Slice 8: Finance)

Base path: `/api/v1`

## Health

### `GET /api/v1/health`

Returns service and database probe status.

Example response:

```json
{
  "status": "ok",
  "service": "rrga-api",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptimeSeconds": 12.3,
  "database": {
    "status": "up"
  }
}
```

Possible `status` values currently:

- `ok` (DB probe succeeds)
- `degraded` (DB probe fails)

## Error envelope baseline

All API errors use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "requestId": "req-id",
    "details": {}
  }
}
```

Current known error codes:

- `VALIDATION_ERROR`
- `ROUTE_NOT_FOUND`
- `INTERNAL_ERROR`
- `REQUEST_ERROR`

## Auth endpoints

### `GET /api/v1/auth/password-policy`

Returns the enforced password policy metadata.

### `POST /api/v1/auth/bootstrap-admin`

Creates the first administrator user **only when `users` is empty**.

Request body:

```json
{
  "username": "admin",
  "password": "AdminPass1!"
}
```

### `POST /api/v1/auth/login`

Offline username/password login.

- Enforces complexity policy via stored argon2id salted hashes
- Locks account for 15 minutes after 5 failed attempts
- Sets `rrga_session` httpOnly cookie on success

### `POST /api/v1/auth/logout`

Requires session. Revokes session and clears session cookie.

### `GET /api/v1/auth/me`

Requires session. Returns authenticated user and role set.

### `POST /api/v1/auth/change-password`

Requires session.

- Validates current password
- Enforces new password policy
- Revokes other active sessions for that user
- Issues a fresh session cookie

## RBAC baseline route

### `GET /api/v1/admin/ping`

Requires authentication and `administrator` role.

Expected denial behavior:

- unauthenticated: `401 UNAUTHORIZED`
- authenticated without role: `403 FORBIDDEN`

## Admin upload-hold governance routes

All routes in this section are administrator-only and require authentication.

### `GET /api/v1/admin/upload-holds`

- Returns currently held versions for:
  - researcher application documents
  - journal attachments

### `POST /api/v1/admin/upload-holds/researcher-documents/:versionId/release`

- Body: `{ "note": "required, min 3 chars" }`
- Releases a held researcher document version by clearing hold state.
- Returns `409 HOLD_NOT_ACTIVE` when version is already released.

### `POST /api/v1/admin/upload-holds/journal-attachments/:versionId/release`

- Body: `{ "note": "required, min 3 chars" }`
- Releases a held journal attachment version by clearing hold state.
- Returns `409 HOLD_NOT_ACTIVE` when version is already released.

## Audit coverage in this slice

The API writes immutable `audit_events` rows for:

- login success/failure
- lockout trigger
- logout
- password change
- access-denied events (401/403 guard paths)

## Policy routes

### `GET /api/v1/policies`

- Auth required.
- Researchers receive active policies.
- Administrators receive active + inactive policies.

### `POST /api/v1/policies`

- Administrator only.
- Creates policy period/deadline/grace/cap + required-document templates.
- Supports `approvalLevelsRequired` (`1..3`, default `1`) for approver sign-off depth.

### `PATCH /api/v1/policies/:policyId`

- Administrator only.
- Updates policy fields and template set, including `approvalLevelsRequired`.

### `DELETE /api/v1/policies/:policyId`

- Administrator only.
- Deletes policy only when no applications reference it.

## Researcher application routes

### `POST /api/v1/researcher/applications`

- Researcher only.
- Creates `DRAFT` application.
- Rejects duplicates in same policy period.

### `GET /api/v1/researcher/applications`

- Researcher only.
- Lists own applications with deadline state payload.

### `GET /api/v1/researcher/applications/:applicationId`

- Researcher owner only.
- Returns application + policy + document metadata + deadline state.

### `POST /api/v1/researcher/applications/:applicationId/submit`

- Researcher owner only.
- Validates duplicate, required templates, annual cap, and deadline/grace.
- Outcomes:
  - `SUBMITTED_ON_TIME`
  - `SUBMITTED_LATE`
  - `BLOCKED_LATE` (rejected submit)
  - reviewer workflow can later transition submitted applications to `UNDER_REVIEW`, `RETURNED_FOR_REVISION`, `APPROVED`, `REJECTED`

Deadline payload states exposed to frontend:

- `on_time`
- `late_grace`
- `late_extension_open`
- `blocked_no_extension`
- `blocked_extension_consumed`
- `blocked_extension_expired`

Each deadline payload includes:

- `submissionAllowed` (boolean)
- `message` (human-readable explanation)
- `deadlineAt`, `graceDeadlineAt`
- `extensionUntil`, `extensionUsedAt`

### `POST /api/v1/researcher/applications/:applicationId/resubmit`

- Researcher owner only.
- Allowed only from `RETURNED_FOR_REVISION`.
- Runs same validations and deadline rules as submit.

## Document versioning routes

### `POST /api/v1/researcher/applications/:applicationId/documents/file`

- Multipart upload.
- Adds file version under logical `documentKey`.
- Max 20 versions per document.
- Upload validation includes MIME sniffing, executable-content blocking, archive safety checks, and sensitive-pattern detection.
- File-backed version payload includes scan metadata fields: `securityScanStatus`, `securityFindings`, `isAdminReviewRequired`, and `detectedMimeType`.

### `POST /api/v1/researcher/applications/:applicationId/documents/link`

- Adds HTTP/HTTPS link version under logical `documentKey`.
- Max 20 versions per document.

### `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/versions`

- Lists version history with active pointer.

### `POST /api/v1/researcher/applications/:applicationId/documents/:documentId/rollback/:versionId`

- Sets active version pointer to selected historical version.

### `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/preview`

- PDF/image files only.
- Returns 415 for non-previewable versions.
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held for admin release.

### `GET /api/v1/researcher/applications/:applicationId/documents/:documentId/download`

- File versions stream binary download.
- Link versions return metadata payload with `externalUrl`.
- Supports query `watermark=true|false` (default true).
- When watermark enabled, response headers include `x-rrga-watermark` and `x-rrga-watermark-mode`.
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held for admin release.

## One-time extension route

### `POST /api/v1/researcher/applications/:applicationId/extensions`

- Administrator only.
- Grants one extension record per application.
- Extension is consumed on first eligible late submit after grace.

## Workflow routes

All workflow routes require authentication plus role-specific RBAC.

### Reviewer endpoints

#### `GET /api/v1/workflow/reviewer/queue`

- Reviewer only.
- Lists applications currently in submitted states (`SUBMITTED_ON_TIME`, `SUBMITTED_LATE`).

#### `GET /api/v1/workflow/reviewer/applications/:applicationId`

- Reviewer only.
- Returns workflow detail payload: application, workflow state, latest eligibility evaluation, review/approval action trail, and submitted document metadata.

#### `GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/preview`

- Reviewer only.
- Streams preview for previewable file-backed submissions.
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held.

#### `GET /api/v1/workflow/reviewer/applications/:applicationId/documents/:documentId/download`

- Reviewer only.
- File-backed version: binary response.
- Link-backed version: JSON `{ mode: "external_link", externalUrl }`.
- Supports query `watermark=true|false` (default true) with watermark headers (`x-rrga-watermark`, `x-rrga-watermark-mode`).
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held.

#### `POST /api/v1/workflow/reviewer/applications/:applicationId/decision`

- Reviewer only.
- Body:

```json
{
  "decision": "forward_to_approval | return_for_revision | reject",
  "comment": "required, min 3 chars"
}
```

- Records `review_eligibility` validation (explicit checks + reasons).
- If `forward_to_approval`, eligibility must pass.
- Transitions status to:
  - `UNDER_REVIEW` (forward)
  - `RETURNED_FOR_REVISION` (return)
  - `REJECTED` (reject)

### Approver endpoints

#### `GET /api/v1/workflow/approver/queue`

- Approver only.
- Lists `UNDER_REVIEW` applications with pending `nextApprovalLevel`.

#### `GET /api/v1/workflow/approver/applications/:applicationId`

- Approver only.
- Object-level boundary: only accessible when application is in active approver sign-off state.
- Returns submitted document metadata in addition to workflow context.

#### `GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/preview`

- Approver only.
- Streams preview for previewable file-backed submissions.
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held.

#### `GET /api/v1/workflow/approver/applications/:applicationId/documents/:documentId/download`

- Approver only.
- File-backed version: binary response.
- Link-backed version: JSON `{ mode: "external_link", externalUrl }`.
- Supports query `watermark=true|false` (default true) with watermark headers (`x-rrga-watermark`, `x-rrga-watermark-mode`).
- Returns `423 DOCUMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held.

#### `POST /api/v1/workflow/approver/applications/:applicationId/sign-off`

- Approver only.
- Body:

```json
{
  "decision": "approve | reject",
  "comment": "required, min 3 chars"
}
```

- Enforces ordered level progression using policy-configured `approvalLevelsRequired` (`1..3`).
- Outcomes:
  - intermediate approve: remains `UNDER_REVIEW`, advances `nextApprovalLevel`
  - final approve: transitions to `APPROVED`
  - reject: transitions to `REJECTED`

## Workflow audit immutability

- Review and approval actions are written to `application_review_actions`.
- DB trigger blocks `UPDATE` and `DELETE` so the trail remains append-only.

## Journal governance routes

All routes in this section are administrator-only and require authentication.

### Custom field definitions

#### `GET /api/v1/journal-governance/custom-fields`

- Lists custom field definitions.
- Query: `includeInactive=true|false` (default false).

#### `POST /api/v1/journal-governance/custom-fields`

- Creates a field definition.
- Field key format: `^[a-z][a-z0-9_]{1,62}$`.
- Supported field types: `TEXT`, `NUMBER`, `DATE`, `URL`, `BOOLEAN`, `SELECT`.
- `SELECT` requires one or more options.

#### `PATCH /api/v1/journal-governance/custom-fields/:fieldId`

- Updates label/type/required/options/help text and active state.

### Journal master data

#### `GET /api/v1/journal-governance/journals`

- Lists journals.
- Query: `includeDeleted=true|false` (default false).

#### `POST /api/v1/journal-governance/journals`

- Creates a journal record.
- Accepts `customFieldValues` as JSON object keyed by admin-defined field keys.
- Validates values against active field definitions.

#### `GET /api/v1/journal-governance/journals/:journalId`

- Returns journal detail with:
  - current journal record
  - custom field definitions
  - journal version history
  - attachment list

#### `PATCH /api/v1/journal-governance/journals/:journalId`

- Updates title / ISSN / publisher / custom field values.
- Writes a new immutable history snapshot.

#### `DELETE /api/v1/journal-governance/journals/:journalId`

- Soft-deletes journal record.
- Writes a delete snapshot to history.

#### `GET /api/v1/journal-governance/journals/:journalId/history`

- Returns immutable version history snapshots.

### Journal attachment routes

#### `POST /api/v1/journal-governance/journals/:journalId/attachments/file`

- Multipart upload.
- Categories: `CONTRACT | QUOTE | SAMPLE_ISSUE | OTHER`.
- File version stores scan metadata: `securityScanStatus`, `securityScanFindings`, `isAdminReviewRequired`, `detectedMimeType`.
- Held attachment versions are blocked from download until administrator release.

#### `POST /api/v1/journal-governance/journals/:journalId/attachments/link`

- Adds or versions a link-backed attachment.
- Requires HTTP/HTTPS URL.

#### `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/versions`

- Lists attachment versions.

#### `GET /api/v1/journal-governance/journals/:journalId/attachments/:attachmentId/download`

- Link-backed version returns metadata JSON.
- File-backed version streams binary download.
- Supports query `watermark=true|false` (default true) with watermark headers (`x-rrga-watermark`, `x-rrga-watermark-mode`).
- Returns `423 ATTACHMENT_HELD_FOR_ADMIN_REVIEW` when latest version is held.

## Resource booking routes

### Resource manager endpoints

#### `GET /api/v1/resource-booking/manager/resources`

- Lists resources for manager view.

#### `POST /api/v1/resource-booking/manager/resources`

- Creates resource with:
  - `name`
  - `resourceType`
  - `location`
  - `capacity`
  - optional `description`
- Default business hours: Monday–Friday, `08:00–18:00`.

#### `GET /api/v1/resource-booking/manager/resources/:resourceId`

- Returns detail with business hours, blackout windows, and bookings.

#### `PATCH /api/v1/resource-booking/manager/resources/:resourceId`

- Updates manager-controlled resource metadata.

#### `PUT /api/v1/resource-booking/manager/resources/:resourceId/business-hours`

- Replaces business-hours rules for the resource.

#### `POST /api/v1/resource-booking/manager/resources/:resourceId/blackouts`

- Adds maintenance blackout window.

### Researcher booking endpoints

#### `GET /api/v1/resource-booking/researcher/availability`

- Returns availability rows for resources across a requested time window.
- Includes capacity, blackout, and conflict-aware status.

#### `GET /api/v1/resource-booking/researcher/bookings`

- Lists researcher-owned bookings.

#### `POST /api/v1/resource-booking/researcher/bookings`

- Creates booking.
- Enforces:
  - business-hours boundaries
  - blackout overlap rejection
  - capacity limits
  - conflict rejection via DB-backed allocation protection

## Recommendations routes

Researcher-only recommendation endpoints.

### `GET /api/v1/recommendations/researcher`

- Returns deterministic recommendations across:
  - journals
  - funding policies
  - resources
- Each item includes explanation text and score signals.

### `GET /api/v1/recommendations/researcher/preferences`

- Returns stored researcher recommendation preferences.

### `PUT /api/v1/recommendations/researcher/preferences`

- Updates persisted preferences.

### `GET /api/v1/recommendations/researcher/feedback`

- Returns stored feedback rows (`LIKE`, `NOT_INTERESTED`, `BLOCK`).

### `POST /api/v1/recommendations/researcher/feedback`

- Stores feedback for a recommendation target.
- `BLOCK` excludes the item from the returned recommendation list.

## Finance routes

All routes in this section are `finance_clerk` only.

### `GET /api/v1/finance/invoices`

- Lists invoices.
- Optional query `statuses=...`.

### `POST /api/v1/finance/invoices`

- Creates invoice for offline paid service.

### `GET /api/v1/finance/invoices/:invoiceId`

- Returns invoice detail with:
  - invoice
  - payments
  - refunds
  - ledger
- Refund payloads are sanitized for clients:
  - `bankRoutingNumberEncrypted: null`
  - `bankAccountNumberEncrypted: null`
  - `bankAccountName: null`
  - safe operational fields like `bankAccountLast4` remain available.

### `POST /api/v1/finance/invoices/:invoiceId/payments`

- Records offline WeChat payment reference.
- Duplicate transaction refs rejected.

### `POST /api/v1/finance/invoices/:invoiceId/refunds`

- Records full or partial refund.
- `BANK_TRANSFER` refund method encrypts routing/account values at rest.

### `POST /api/v1/finance/reconciliation/import-csv`

- Imports offline settlement CSV.
- Expected header: `wechatTransactionRef,amount,settledAt`.
- Produces matched, mismatched, duplicate, invalid, and unmatched settlement rows.

### `GET /api/v1/finance/reconciliation/queue`

- Returns:
  - unsettled payments
  - open exception rows
  - resolved/closed exception rows

### `POST /api/v1/finance/reconciliation/exceptions/:rowId/resolve`

- Marks exception row `RESOLVED`.
- Requires `resolutionNote`.
- Writes audit + ledger trace.

### `POST /api/v1/finance/reconciliation/exceptions/:rowId/close`

- Marks exception row `CLOSED` without remediation.
- Requires `resolutionNote`.
- Writes audit + ledger trace.

### `GET /api/v1/finance/ledger`

- Lists finance ledger entries.
- Optional query `invoiceId`.

## Finance encryption note

- Refund storage encrypts sensitive bank fields using application-level envelope encryption before DB write.
- Client responses expose only safe operational fields.
