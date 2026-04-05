import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadConfig, type AppConfig } from './lib/config.js';
import { createLoggerConfig } from './lib/logger.js';
import { registerErrorEnvelope } from './plugins/error-envelope.js';
import { apiModules } from './modules/index.js';

const defaultAllowedOrigins = [
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
];

const resolveAllowedOrigins = () => {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : defaultAllowedOrigins;
};

export interface BuildAppOptions {
  config?: AppConfig;
}

export const buildApp = async (options: BuildAppOptions = {}) => {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: createLoggerConfig(config),
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: true,
        useDefaults: true,
        allErrors: true
      }
    }
  });

  app.decorate('config', config);

  const allowedOrigins = resolveAllowedOrigins();

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.includes(origin));
    },
    credentials: true
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: {
      fileSize: config.uploads.maxBytes,
      files: 1
    }
  });

  await app.register(apiModules, { prefix: '/api/v1' });

  registerErrorEnvelope(app);

  return app;
};
