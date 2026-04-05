import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config.js';

export const createLoggerConfig = (config: AppConfig): NonNullable<FastifyServerOptions['logger']> => {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.routingNumber',
        'body.bankAccountNumber',
        '*.password',
        '*.routingNumber',
        '*.bankAccountNumber'
      ],
      censor: '[REDACTED]'
    },
    messageKey: 'message'
  };
};
