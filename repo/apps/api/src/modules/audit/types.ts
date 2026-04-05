export interface AuditWriteInput {
  actorUserId?: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  outcome: 'success' | 'failure' | 'denied';
  details?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}
