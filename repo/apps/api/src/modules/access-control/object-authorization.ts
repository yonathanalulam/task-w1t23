import type { FastifyInstance, FastifyRequest } from 'fastify';
import { forbidden } from '../../lib/http-error.js';

/**
 * Shared object-level authorization helper for future slices.
 * Use when access depends on the ownership of a specific domain object.
 */
export const assertActorOwnsResource = async (input: {
  app: FastifyInstance;
  request: FastifyRequest;
  actorUserId?: string;
  ownerUserId: string;
  entityType: string;
  entityId: string;
}): Promise<void> => {
  const { app, request, actorUserId, ownerUserId, entityType, entityId } = input;

  if (!actorUserId || actorUserId !== ownerUserId) {
    const userAgentHeader = request.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    await app.audit.write({
      ...(actorUserId ? { actorUserId } : {}),
      eventType: 'AUTH_OBJECT_ACCESS_DENIED',
      entityType,
      entityId,
      outcome: 'denied',
      ...(request.id ? { requestId: request.id } : {}),
      ...(request.ip ? { ip: request.ip } : {}),
      ...(userAgent ? { userAgent } : {}),
      details: {
        reason: 'owner_mismatch',
        ownerUserId
      }
    });

    throw forbidden('You do not have permission to access this object.');
  }
};
