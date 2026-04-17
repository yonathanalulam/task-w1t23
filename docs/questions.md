# RRGA Clarification Questions

## Business Logic Questions Log

### 1. Svelte App Structure and Frontend Language
- **Question:** The prompt specifies a Svelte-based web interface and a modern frontend framework but does not name the exact app shell or language choice.
- **My Understanding:** We need a strong standard Svelte foundation for a large multi-role system that supports first-class routing, forms, server/client boundaries, and maintainability.
- **Solution:** Implement the frontend as a SvelteKit + TypeScript application with role-based route areas and shared component patterns.

### 2. Backend Language Under Node.js
- **Question:** The prompt fixes Node.js and Fastify but does not specify whether to use JavaScript or TypeScript.
- **My Understanding:** TypeScript will keep validation, permissions, ledger logic, and audit-heavy workflows safer and easier to maintain in this complex domain.
- **Solution:** Implement the Fastify backend in TypeScript.

### 3. Offline-Capable Payment Settlement Scope
- **Question:** The prompt states payment integration remains offline (referencing WeChat Pay IDs and CSV imports) but does not define whether live gateway calls are required.
- **My Understanding:** The product explicitly excludes online payment scope. The system must handle the entire payment lifecycle locally.
- **Solution:** Model payments as offline records and reconciliation workflows only (invoice creation, manual reference entry, CSV import, reconciliation, refunds, exception handling). Do not add external payment API dependencies.

### 4. Encryption-at-Rest Implementation Level
- **Question:** The prompt requires encryption at rest for sensitive refund fields but does not specify whether this should be database-native, application-level, or both.
- **My Understanding:** We need a secure approach that does not depend on optional database extensions or weaken the offline deployment model.
- **Solution:** Use application-level authenticated encryption. Encrypt designated sensitive fields in the Fastify layer (storing only ciphertext in PostgreSQL), decrypt only for authorized flows, and mask values in logs and non-privileged responses.

### 5. Recommendation Engine Sophistication
- **Question:** The prompt requires personalized recommendations with explainability, feedback controls, and preference editing, but does not prescribe ML or a specific ranking algorithm.
- **My Understanding:** A complex ML model is not strictly required; a transparent, deterministic scoring system can satisfy the requirements while remaining auditable and understandable.
- **Solution:** Implement a deterministic rule/scoring recommendation service based on profile research areas, role context, prior bookings/applications, journal metadata, and user feedback signals. The engine will emit plain-language reason strings and honor likes, not-interested, and block preferences.

### 6. File Preview and Storage Boundaries
- **Question:** The prompt requires browser preview for PDFs and images, plus support for archives and links, but does not define whether archival contents need inline preview.
- **My Understanding:** Inline rendering of archive contents is unsafe and unnecessary based on the prompt's explicit scope.
- **Solution:** Limit inline preview to PDFs and images only. Treat archives and external links as validated attachments with metadata, server-side safety checks, and download/open actions.

### 7. Journal Custom Fields Behavior
- **Question:** The prompt requires admin-defined custom fields without schema-breaking changes but does not prescribe the storage pattern.
- **My Understanding:** We need a flexible storage solution that allows dynamic field addition without requiring database migrations for each new field.
- **Solution:** Store journal custom field definitions and validated values separately from fixed journal columns using PostgreSQL JSONB and server-side validators.

### 8. One-Time Deadline Extension Handling
- **Question:** The prompt states that an Administrator may grant a one-time extension after the grace window, but does not specify how the extension duration should be handled.
- **My Understanding:** Administrators need flexibility and an audit trail when overriding the standard deadline rules.
- **Solution:** Implement one administrator-controlled audited extension action per eligible submission. This action will explicitly set a new replacement deadline and record the reason and the granting administrator's details.