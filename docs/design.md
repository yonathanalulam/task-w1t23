# Research Resource & Grant Administration Design Plan

## Product Scope

This system is an offline-capable Research Resource & Grant Administration platform for institutions that need to manage funding applications, review workflows, governed journal metadata, resource booking, explainable recommendations, and finance reconciliation without depending on live third-party identity or payment services.

The product is intentionally designed as a local-first operational system rather than a cloud-first SaaS surface. "Offline-capable" in this design means the system can be operated on a local network or single-machine deployment with no live dependency on external identity providers, no live payment gateway callbacks, and no requirement for remote recommendation services. All core workflows use the local PostgreSQL database as the system of record and rely on application-managed rules, state transitions, audit trails, and file storage.

The primary capabilities are:

- Secure researcher application submission for subsidy or project requests.
- Policy-driven deadline, grace-window, duplicate, and annual funding-cap enforcement.
- Managed document/link submission with version history, rollback, hold/release status, preview rules, and watermarked download behavior.
- Multi-step reviewer and approver workflow with explicit eligibility evaluation, required comments, and immutable action history.
- Journal catalog governance with custom fields, attachment versions, and administrative history.
- Resource booking for rooms, equipment, and consultation slots with business-hours rules, blackout windows, capacity limits, and conflict prevention.
- Deterministic recommendations across journals, policies, and resources with stored preferences, feedback, and plain-language rationale.
- Offline finance handling for invoices, clerk-recorded WeChat Pay references, refunds, CSV-based settlement reconciliation, exception management, and ledger/audit traceability.

The product serves six role surfaces even though four are primary end-user groups in the business prompt:

- Researchers: create and manage applications, submit required materials, track status, book resources, and use recommendation surfaces.
- Reviewers: evaluate submitted applications, inspect materials, and record reviewer decisions.
- Approvers: sign off eligible applications across up to three approval levels.
- Resource Managers: maintain bookable assets, blackout windows, and business-hour rules.
- Finance Clerks: manage invoices, payments, refunds, reconciliation exceptions, and ledger visibility.
- Administrators: manage policies, journal governance, one-time submission extensions, and upload hold release operations.

## Locked Planning Decisions

The following decisions are considered fixed for this project and should not drift in later changes without an explicit redesign decision.

### Stack and runtime

- Frontend framework: SvelteKit with TypeScript.
- Backend framework: Fastify with TypeScript on Node.js.
- Database: PostgreSQL.
- Primary runtime contract: `./run_app.sh up`.
- Broad test contract: `./run_tests.sh`.
- Database bootstrap contract: `./init_db.sh`.
- Container/runtime model: Docker-first under the wrapper scripts.

The system is not planned around Vue 3 or FastAPI. The design must remain aligned with the actual implemented stack above.

### Test and verification commands

Primary broad commands:

- Runtime: `./run_app.sh up`
- Runtime inspection: `./run_app.sh ps`, `./run_app.sh logs`, `./run_app.sh url`, `./run_app.sh down`
- Broad integrated test path: `./run_tests.sh`

Primary local developer iteration commands:

- API targeted tests: `npm run test -w @rrga/api -- <tests...>`
- Web targeted tests: `npm run test -w @rrga/web -- <tests...>`
- Type checks: `npm run typecheck -w @rrga/api && npm run typecheck -w @rrga/web`
- Integrated browser flows: `./scripts/run_integrated_e2e.sh`

### Data scope decisions

- PostgreSQL is the canonical store for users, roles, sessions, applications, workflow actions, validations, policies, journals, resources, recommendations, invoices, reconciliation rows, and ledger entries.
- File-backed uploads are stored on local application-managed storage with DB metadata rows controlling active version, scan state, previewability, and hold status.
- External links are allowed as attachment versions for approved surfaces, but only as explicit metadata-backed versions rather than embedded remote content.
- Journal custom fields are stored as admin-managed definitions plus JSONB-backed values, avoiding per-field schema migrations.
- Recommendation outputs are deterministic and derived from local domain data plus stored user feedback, not from external ML services.

### Sync and backup policy

- There is no multi-node live sync requirement in this project.
- Operational continuity depends on local database and file storage backup, not remote service synchronization.
- Session state is local and server-side.
- Finance import is offline and file-based, not remote API-based.
- Database backup and restore must be treated as an operator concern outside the core product UI, but the design assumes PostgreSQL dump/restore plus file storage backup as the recovery model.
- Runtime wrappers must not require committed `.env` files; runtime values come from process environment or `*_FILE` secret paths.

## Core Domain Interpretation

The system does not use TrailForge concepts such as Datasets, Projects, and Itineraries. For this system, the strict business objects are funding policies, researcher applications, application documents, workflow actions, journals, resources, recommendations, invoices, refunds, and reconciliation exceptions. To satisfy the requested section structure while staying prompt-faithful, this design maps the business interpretation as follows:

- "Datasets" corresponds to governed master/reference data and evidentiary attachments.
- "Projects" corresponds to policy-bound researcher applications moving through review and approval.
- "Itineraries" corresponds to scheduled operational plans such as bookings, approval progression, and settlement exception handling.

### Dataset interpretation: governed master and evidence records

Dataset-like entities in this system are:

- Funding policies and their required template definitions.
- Journal catalog records and custom-field definitions.
- Resource definitions, business-hour rules, and blackout windows.
- Recommendation preference/feedback rows.
- Settlement import rows and finance exception records.

Strict rules:

- Policy templates define the required document keys for applications under that policy.
- Journal custom fields are governed by admin-defined schemas and validated values; field creation or modification must not require destructive schema changes.
- Resource datasets are mutable only by authorized resource-manager flows and must preserve enough state for reliable availability calculation.
- Settlement rows are imported records, not authoritative payment instructions; they drive reconciliation and exception handling only.
- Held file versions remain part of the evidence record but cannot satisfy submission completeness or remain accessible until administrator release.

### Project interpretation: policy-bound application lifecycle

The core project-like entity is the researcher application.

Strict business rules:

- Every application belongs to exactly one funding policy.
- Every application has exactly one applicant user.
- Application creation begins in `DRAFT`.
- Submit/resubmit is only allowed from an editable state.
- Duplicate applications within the same policy period for the same applicant are rejected.
- Annual funding cap validation must consider already submitted/committed amounts in the relevant fiscal year.
- Deadline evaluation must distinguish on-time, grace-late, extension-allowed, blocked-no-extension, blocked-extension-consumed, and blocked-extension-expired states.
- One-time extension may be granted once per eligible application and is consumed on first qualifying late submission.
- Required template satisfaction is based on active, non-held document versions.
- Held files do not count as satisfying required document obligations.
- Reviewer flow begins only from submitted states.
- Reviewer can forward, return for revision, or reject, but forward requires eligibility checks to pass.
- Approval flow can require one to three approval levels based on policy configuration.
- Approval comments are mandatory for every sign-off action.
- Review and approval trails are immutable.

Application status model:

- `DRAFT`
- `SUBMITTED_ON_TIME`
- `SUBMITTED_LATE`
- `BLOCKED_LATE`
- `UNDER_REVIEW`
- `RETURNED_FOR_REVISION`
- `APPROVED`
- `REJECTED`

### Itinerary interpretation: scheduled operational flows

Operational itinerary-like behavior in this product exists in:

- Resource booking windows.
- Approval level progression.
- Payment and refund lifecycle.
- Reconciliation exception lifecycle.

Strict rules:

- Resource bookings must fall inside configured business hours.
- Resource bookings must not overlap blackout windows.
- Capacity must be respected for each booking request.
- DB-level conflict prevention must stop double-booking races.
- Workflow approval progresses in ordered levels only; no skipping.
- Finance exceptions move from open discrepancy state into resolved or closed terminal handling states.
- Refund actions must preserve actor, time, and method metadata while exposing only sanitized data to clients.

## System Architecture

The system is a fullstack monorepo with explicit separation between API, web, and shared contract layers.

### Repository structure

- `apps/api`: Fastify API, migrations, services, repositories, route modules, and domain rules.
- `apps/web`: SvelteKit web application with role-oriented route groups, server loaders, actions, and API proxy surfaces.
- `packages/shared`: shared type or cross-app support package boundary.
- `scripts`: local runtime verification, E2E runner, and runtime helper scripts.
- `init_db.sh`: canonical database preparation path.
- `run_app.sh`: primary operational runtime wrapper.
- `run_tests.sh`: broad Dockerized verification entrypoint.

### Frontend architecture

The frontend is organized around server-rendered route families and role-specific workspaces.

#### Frontend shell responsibilities

- Enforce route family access through `hooks.server.ts`.
- Maintain authenticated user and role state through server-side session lookups.
- Provide a stable route hierarchy for role workspaces.
- Keep API interaction behind shared server helpers rather than ad hoc fetch patterns.

#### Frontend module responsibilities

##### Auth surface

- `/login` handles offline username/password entry.
- `/forbidden` handles denied route navigation.
- Session proxy routes manage login/logout/me/change-password interactions.

##### Researcher workspace

- `/researcher` shows policy selection, draft creation, status overview, and application list.
- `/researcher/applications/[applicationId]` handles document upload/link creation, version history, rollback, preview/download, held-state visibility, deadline messaging, and submit/resubmit actions.
- `/researcher/resources` shows availability and booking actions.
- `/researcher/recommendations` shows recommendations, explanations, preferences, and feedback controls.

##### Reviewer workspace

- `/reviewer` shows reviewer queue.
- `/reviewer/applications/[applicationId]` shows eligibility context, submitted materials, preview/download access, held-state warnings, reviewer decision form, and audit trail.

##### Approver workspace

- `/approver` shows approver queue.
- `/approver/applications/[applicationId]` shows approval-level progress, submitted materials, preview/download access, held-state warnings, sign-off form, and audit trail.

##### Resource manager workspace

- `/manager` lists and creates resources.
- `/manager/resources/[resourceId]` configures capacity, business hours, blackout windows, and sees booking state.

##### Finance workspace

- `/finance` is the finance operations dashboard for invoices, reconciliation imports, exception queue actions, and status summaries.
- `/finance/invoices/[invoiceId]` exposes payment, refund, and ledger detail.

##### Administrator workspace

- `/admin` manages policies, one-time extensions, and held-upload release queue.
- `/admin/journals` and `/admin/journals/[journalId]` govern journals, custom fields, attachments, versions, and history.

#### Frontend supporting contracts

- Role-specific asset proxy routes must exist for secure preview/download forwarding.
- Frontend pages must not expose raw storage paths.
- UI must surface held-state, deadline-state, and exception-state messages explicitly rather than hiding them in server-only logic.
- Download links for governed attachments should default to watermarked behavior where supported.

### Backend architecture

The backend follows a domain-module structure with service/repository separation and Fastify route plugins.

#### Backend core layers

##### App bootstrap layer

- `index.ts` starts the server.
- `app.ts` assembles Fastify plugins, logger, validation, error envelope, and module registration.
- shared decorators expose typed services and request auth state.

##### Cross-cutting backend services

- logger and redaction configuration
- error envelope plugin
- auth guards and role checks
- object authorization helper layer
- audit event writer
- encryption helper for sensitive finance fields
- upload-security classifier
- watermark helper

#### Domain module responsibilities

##### Auth module

- bootstrap first admin when no users exist
- password policy reporting
- login/logout/session validation
- password change flow
- failed-attempt and lockout handling
- audit entries for auth events

##### Policies module

- create/list/update/delete policies
- manage period, deadline, grace window, annual cap, and approval-level depth
- manage required template definitions

##### Researcher module

- application creation and retrieval
- duplicate detection
- annual cap validation
- deadline/grace/extension decisioning
- document and link version creation
- rollback and version listing
- preview/download rules for owned documents
- submit/resubmit state transitions

##### Workflow module

- reviewer queue and detail
- approver queue and detail
- eligibility evaluation calculation
- reviewer decision recording
- ordered approver sign-off progression
- submitted-material access for reviewer/approver roles
- held-document access blocking

##### Journals module

- custom field definition management
- journal CRUD
- immutable journal history snapshots
- attachment file/link versioning
- held attachment behavior and access gating

##### Resource booking module

- resource CRUD for manager role
- business-hours rule management
- blackout window management
- availability calculation
- booking creation with conflict protection

##### Recommendations module

- deterministic recommendation scoring
- explanation string generation
- researcher preference persistence
- feedback persistence for like/not-interested/block
- block filtering in result set

##### Finance module

- invoice creation and listing
- payment reference recording
- refund creation with encrypted bank details at rest
- CSV settlement import
- open/resolved/closed exception queue behavior
- finance ledger entries
- sanitized finance detail responses

##### Admin module

- upload-hold queue listing
- held researcher document release
- held journal attachment release

### Persistence architecture

Persistence is relational and stateful. Key table groups include:

- identity and access: users, roles, user_roles, sessions, auth_attempts, audit_events
- policies and application data: funding_policies, policy_templates, applications, application_documents, application_document_versions, application_validations
- workflow: application_review_actions, workflow state helpers
- journal governance: custom field definitions, journals, journal versions, journal attachments, attachment versions
- booking: resources, business hours, blackout windows, bookings
- recommendations: recommendation preferences, recommendation feedback
- finance: invoices, payments, refunds, settlement rows, reconciliation exceptions, ledger entries

## Cross-Cutting Contracts

### Authentication contract

- Authentication is strictly offline username/password.
- Password policy requires at least 10 characters and complexity enforcement.
- Password hashing uses argon2id with salted hashes.
- Lockout triggers after 5 failed attempts and lasts 15 minutes.
- Session state is server-side and bound to an httpOnly cookie.
- Auth endpoints must emit audit events for success, failure, lockout, logout, and password change.

### Security contract

- Sensitive refund bank values are encrypted before DB persistence.
- Client responses must never expose ciphertext or raw routing/account-holder values.
- Logs must redact known sensitive keys.
- Role-based permissions apply to all mutation and governed download surfaces.
- Watermarked download behavior must be supported for governed file downloads, with username and timestamp context.

HTTPS note:

- The prompt did not explicitly require public internet TLS termination, so the system is not designed around an internal certificate-management subsystem.
- Deployment should still assume TLS termination at the environment edge when used beyond local development, but that is an operational deployment concern rather than an in-product workflow module.

### Governance contract

- Duplicate applications in the same policy period are forbidden.
- Annual applicant funding cap is enforced at submission time using fiscal-year aggregation.
- Approval depth is policy-configurable from 1 to 3 levels.
- Comments are mandatory on reviewer decisions and approver sign-offs.
- Audit/event trails for workflow and finance actions are append-only by design.
- Journal field definitions are admin-governed; journal values must validate against the active field schema.

### Planner behavior contract

There is no separate itinerary planner engine in this product, so planner behavior maps to rule-driven scheduling and workflow progression.

- Booking planner behavior means computing availability from business hours, blackout windows, current bookings, and capacity.
- Workflow planner behavior means computing the next valid reviewer/approver action from current application status and policy approval depth.
- Recommendation planner behavior means deterministic ranking using local data, stored preferences, and recent interaction signals.
- Finance planner behavior means surfacing unsettled and exception states for clerk follow-up, not automating external settlement.

### File handling contract

- File-backed uploads are limited by server-side size checks.
- Current system baseline uses the project-defined upload limits and scan pipeline already implemented; no new TrailForge-specific 20 MB cap is introduced here because it would conflict with the RRGA prompt and implemented design.
- Allowed handling types include uploaded files and external links, but preview is limited to PDF and image file types.
- Server-side checks include MIME sniffing, executable blocking, archive safety checks, and sensitive-pattern detection.
- Sensitive-pattern detection may produce `WARNING` or `HELD` outcomes.
- Held files are excluded from required-document completeness and are blocked from preview/download until administrator release.
- File versions are limited to 20 versions per logical document or attachment.
- Download behavior may attach watermark metadata headers and, for supported text-like content, inject a watermark prefix.

### Offline operations contract

- The product must remain usable without internet access for identity, recommendation generation, policy enforcement, and finance operations.
- Payment integration remains offline by design; WeChat transaction identifiers are manually recorded, not fetched or confirmed online.
- CSV import is the reconciliation mechanism; no webhook ingestion exists.
- All major workflows must continue to function against local DB and local file storage.

## Planned Delivery Slices

The project was planned and delivered as sequential, bounded vertical slices. This section remains useful as the canonical phased breakdown of the system.

### Slice 1: Runtime scaffold and project foundations

- monorepo structure
- API/web app shells
- Docker-first wrapper contracts
- DB init path
- broad test wrapper
- baseline docs and test tooling

### Slice 2: Authentication, RBAC, and audit baseline

- offline username/password auth
- password policy
- argon2id hashing
- lockout behavior
- role guards and route protection
- auth audit events
- login/forbidden UI

### Slice 3: Researcher submissions

- policies and required templates
- application create/view/submit/resubmit
- deadline, grace, extension rules
- duplicate and annual cap validation
- document/link upload versioning, rollback, preview/download

### Slice 4: Review and approval workflow

- reviewer queue/detail
- eligibility evaluation record
- required reviewer comments
- approver sign-off across 1 to 3 levels
- immutable workflow trail
- return-for-revision integration

### Slice 5: Journal governance

- journal CRUD
- custom fields
- history snapshots
- attachment versioning
- admin governance UI

### Slice 6: Resource booking

- resource manager catalog/configuration
- business hours and blackout windows
- availability surface
- booking creation
- conflict and capacity enforcement

### Slice 7: Recommendations

- deterministic scoring
- explanation text
- preference persistence
- like/not-interested/block feedback
- researcher recommendation UI

### Slice 8: Finance and reconciliation

- invoices
- offline WeChat references
- refunds with encrypted bank values at rest
- CSV settlement import
- discrepancy queue and ledger visibility

### Slice 9: Documentation and targeted test completion

- README tightening
- reviewer guide
- security boundaries
- API spec
- frontend flow matrix
- evaluator-oriented test coverage map

### Slice 10: Integrated verification

- broad Dockerized verification
- integrated Playwright major-flow coverage
- screenshot-backed UI proof

### Slice 11: Hardening

- deeper upload security enforcement
- finance exception resolution lifecycle
- docs honesty and redaction review

### Slice 12: Evaluation and fix verification

- static external audit
- targeted remediation
- focused fix verification

## Final Design Summary

This design intentionally favors explicit institutional governance over hidden automation. The system is built around local authority, traceable approvals, deterministic rules, and role-specific workspaces. The most important product guarantees are:

- no dependence on live third-party identity or payment infrastructure
- no silent bypass of policy, funding, booking, or approval rules
- no ambiguous document state when a file is flagged for review
- no opaque recommendation logic
- no finance trail without actor/time visibility

That combination is what makes the system fit the actual RRGA task rather than a generic workflow demo.
