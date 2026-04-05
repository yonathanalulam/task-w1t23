import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { loadConfig, type AppConfig } from './lib/config.js';
import { createLoggerConfig } from './lib/logger.js';
import { registerErrorEnvelope } from './plugins/error-envelope.js';
import { apiModules } from './modules/index.js';

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

  await app.register(cors, {
    origin: true,
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
