import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorEnvelope } from '@rrga/shared';

const sendError = (
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void => {
  const payload: ApiErrorEnvelope = {
    error: {
      code,
      message,
      requestId: request.id,
      ...(details ? { details } : {})
    }
  };

  reply.status(statusCode).send(payload);
};

export const registerErrorEnvelope = (app: FastifyInstance): void => {
  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error('Unknown error');

    request.log.error({ err: normalizedError }, 'request_failed');

    if ('validation' in normalizedError) {
      sendError(reply, request, 400, 'VALIDATION_ERROR', 'Request validation failed', (normalizedError as { validation: unknown }).validation);
      return;
    }

    const statusCode =
      'statusCode' in normalizedError && typeof normalizedError.statusCode === 'number' && normalizedError.statusCode >= 400
        ? normalizedError.statusCode
        : 500;
    const code =
      'code' in normalizedError && typeof normalizedError.code === 'string'
        ? normalizedError.code
        : statusCode === 500
          ? 'INTERNAL_ERROR'
          : 'REQUEST_ERROR';
    const message = statusCode === 500 ? 'Internal server error' : normalizedError.message;
    const details = 'details' in normalizedError ? (normalizedError as { details?: unknown }).details : undefined;

    sendError(reply, request, statusCode, code, message, details);
  });

  app.setNotFoundHandler((request, reply) => {
    sendError(reply, request, 404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.url} not found`);
  });
};
