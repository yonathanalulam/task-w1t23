## Item 1: Svelte app structure and frontend language

### What was unclear
The prompt specifies a Svelte-based web interface and a modern frontend framework but does not name the exact app shell or language choice.

### Interpretation
Use SvelteKit with TypeScript so the app has first-class routing, forms, server/client boundaries where useful, and a maintainable typed codebase.

### Decision
Implement the frontend as a SvelteKit + TypeScript application with role-based route areas and shared component patterns.

### Why this is reasonable
It stays fully within the requested Svelte frontend scope while choosing the strongest standard Svelte foundation for a large multi-role system.

## Item 2: Backend language under Node.js

### What was unclear
The prompt fixes Node.js and Fastify but does not specify JavaScript versus TypeScript.

### Interpretation
Use TypeScript on the backend to keep validation, permissions, ledger logic, and audit-heavy workflows safer and easier to maintain.

### Decision
Implement the Fastify backend in TypeScript.

### Why this is reasonable
This preserves the requested backend stack and improves correctness for a domain with heavy workflow and security rules.

## Item 3: Offline-capable payment settlement scope

### What was unclear
The prompt says payment integration remains offline and references WeChat Pay transaction identifiers plus CSV settlement imports, but does not define whether live gateway calls are required.

### Interpretation
No live payment gateway integration is required. The product should support invoice creation, manual WeChat Pay reference entry, CSV settlement import, reconciliation, refunds, and exception handling entirely within the local system.

### Decision
Model payments as offline records and reconciliation workflows only; do not add external payment API dependencies.

### Why this is reasonable
It matches the prompt directly and avoids inventing online payment scope that the user explicitly excluded.

## Item 4: Encryption-at-rest implementation level

### What was unclear
The prompt requires encryption at rest for sensitive refund fields but does not specify whether this should be database-native, application-level, or both.

### Interpretation
Use application-level authenticated encryption before persistence, with key material provided at runtime, and store only ciphertext plus metadata in PostgreSQL.

### Decision
Encrypt designated sensitive fields in the Fastify layer, decrypt only for authorized flows, and mask those values in logs and non-privileged responses.

### Why this is reasonable
This satisfies the security requirement without depending on optional database extensions or weakening the offline deployment model.

## Item 5: Recommendation engine sophistication

### What was unclear
The prompt requires personalized recommendations with explainability, feedback controls, and preference editing but does not require ML or a specific ranking algorithm.

### Interpretation
Use a deterministic explainable scoring engine based on profile research areas, role context, prior bookings, prior applications, journal metadata, and user feedback signals.

### Decision
Implement a transparent rule/scoring recommendation service that emits plain-language reason strings and honors likes, not-interested, and block preferences.

### Why this is reasonable
It fully covers the requested behavior while keeping explanations auditable and understandable.

## Item 6: File preview and storage boundaries

### What was unclear
The prompt requires browser preview for PDFs and images plus support for archives and external links, but does not define whether archival contents need inline preview.

### Interpretation
Support inline preview for PDFs and images only. Archives and external links should show validated metadata and download/open actions, while archive contents are scanned server-side for safety rather than rendered inline.

### Decision
Keep inline preview limited to PDFs and images; treat other assets as validated attachments with metadata, safety checks, and download controls.

### Why this is reasonable
That is exactly consistent with the prompt’s explicit preview scope and avoids unnecessary unsafe archive rendering.

## Item 7: Journal custom fields behavior

### What was unclear
The prompt requires admin-defined custom fields without schema-breaking changes but does not prescribe the storage pattern.

### Interpretation
Use metadata definitions plus JSONB-backed values with validation rules so administrators can add fields without database migrations for each field.

### Decision
Store journal custom field definitions and validated values separately from fixed journal columns, backed by PostgreSQL JSONB and server-side validators.

### Why this is reasonable
It directly satisfies the no-schema-break requirement while remaining queryable and maintainable.

## Item 8: One-time deadline extension handling

### What was unclear
The prompt states that an Administrator may grant a one-time extension after the grace window, but does not specify the extension duration behavior.

### Interpretation
Allow administrators to set a single explicit replacement deadline per application or submission request, with reason capture and audit trail.

### Decision
Implement one administrator-controlled audited extension action per eligible submission or application that records the new deadline, the reason, and who granted it.

### Why this is reasonable
It honors the one-time-extension rule while preserving administrative flexibility and auditability.
