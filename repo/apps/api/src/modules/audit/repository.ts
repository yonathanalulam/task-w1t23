import type { Pool } from 'pg';
import type { AuditWriteInput } from './types.js';

export const writeAuditEvent = async (pool: Pool, input: AuditWriteInput): Promise<void> => {
  await pool.query(
    `
      INSERT INTO audit_events (
        actor_user_id,
        event_type,
        entity_type,
        entity_id,
        outcome,
        details,
        request_id,
        ip,
        user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::inet,$9)
    `,
    [
      input.actorUserId ?? null,
      input.eventType,
      input.entityType,
      input.entityId ?? null,
      input.outcome,
      JSON.stringify(input.details ?? {}),
      input.requestId ?? null,
      input.ip ?? null,
      input.userAgent ?? null
    ]
  );
};
