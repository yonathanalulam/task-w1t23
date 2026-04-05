import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { UserRole } from '@rrga/shared';
import { forbidden, unauthorized } from '../../lib/http-error.js';

const auditDenied = async (
  app: FastifyInstance,
  request: FastifyRequest,
  actorUserId: string | undefined,
  details: Record<string, unknown>
): Promise<void> => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  await app.audit.write({
    ...(actorUserId ? { actorUserId } : {}),
    eventType: 'AUTH_ACCESS_DENIED',
    entityType: 'route',
    ...(request.routeOptions.url ? { entityId: request.routeOptions.url } : {}),
    outcome: 'denied',
    ...(request.id ? { requestId: request.id } : {}),
    ...(request.ip ? { ip: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    details
  });
};

export const requireAuthenticated = (app: FastifyInstance): preHandlerHookHandler => {
  return async (request: FastifyRequest) => {
    if (!request.auth) {
      await auditDenied(app, request, undefined, {
        reason: 'unauthenticated',
        method: request.method,
        url: request.url
      });
      throw unauthorized();
    }
  };
};

export const requireRoles = (app: FastifyInstance, allowedRoles: UserRole[]): preHandlerHookHandler => {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth) {
      await auditDenied(app, request, undefined, {
        reason: 'unauthenticated',
        allowedRoles
      });
      throw unauthorized();
    }

    const hasRole = auth.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      await auditDenied(app, request, auth.userId, {
        reason: 'missing_role',
        allowedRoles,
        actorRoles: auth.roles
      });
      throw forbidden('You do not have permission to access this resource.');
    }
  };
};
