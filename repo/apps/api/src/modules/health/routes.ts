import type { FastifyPluginAsync } from 'fastify';
import { probeDatabase } from '../../lib/db.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'service', 'timestamp', 'uptimeSeconds', 'database'],
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              timestamp: { type: 'string' },
              uptimeSeconds: { type: 'number' },
              database: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      const databaseStatus = await probeDatabase(app.config);

      return reply.send({
        status: databaseStatus === 'up' ? 'ok' : 'degraded',
        service: 'rrga-api',
        timestamp: new Date().toISOString(),
        uptimeSeconds: process.uptime(),
        database: {
          status: databaseStatus
        }
      });
    }
  );
};
