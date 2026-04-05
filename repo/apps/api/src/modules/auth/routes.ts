import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/http-error.js';
import { passwordPolicyDescription } from './password-policy.js';
import { requireAuthenticated } from '../access-control/guards.js';

const toMeta = (request: FastifyRequest): { requestId: string; ip: string; userAgent?: string } => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/password-policy', async () => {
    return {
      policy: passwordPolicyDescription
    };
  });

  app.post(
    '/bootstrap-admin',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 80 },
            password: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const body = request.body as { username: string; password: string };

      const user = await app.authService.bootstrapAdmin(body.username, body.password, toMeta(request));

      return reply.code(201).send({
        user
      });
    }
  );

  app.post(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 80 },
            password: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const body = request.body as { username: string; password: string };
      const login = await app.authService.login({
        username: body.username,
        password: body.password,
        meta: toMeta(request)
      });

      reply.setCookie(app.config.auth.sessionCookieName, login.sessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.nodeEnv === 'production',
        expires: login.expiresAt
      });

      return reply.send({
        user: login.user,
        session: {
          expiresAt: login.expiresAt.toISOString()
        }
      });
    }
  );

  app.post('/logout', { preHandler: [requireAuthenticated(app)] }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    await app.authService.logout(auth, toMeta(request));

    reply.clearCookie(app.config.auth.sessionCookieName, {
      path: '/',
      sameSite: 'lax',
      secure: app.config.nodeEnv === 'production',
      httpOnly: true
    });

    return reply.code(204).send();
  });

  app.get('/me', { preHandler: [requireAuthenticated(app)] }, async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const user = await app.authService.me(auth);
    return { user };
  });

  app.post(
    '/change-password',
    {
      preHandler: [requireAuthenticated(app)],
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'nextPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', minLength: 1 },
            nextPassword: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const body = request.body as { currentPassword: string; nextPassword: string };

      const nextSession = await app.authService.changePassword({
        auth,
        currentPassword: body.currentPassword,
        nextPassword: body.nextPassword,
        meta: toMeta(request)
      });

      reply.setCookie(app.config.auth.sessionCookieName, nextSession.sessionToken, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.nodeEnv === 'production',
        expires: nextSession.expiresAt
      });

      return reply.send({
        ok: true,
        session: {
          expiresAt: nextSession.expiresAt.toISOString()
        }
      });
    }
  );
};
