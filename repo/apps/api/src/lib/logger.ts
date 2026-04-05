import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config.js';

export const createLoggerConfig = (config: AppConfig): NonNullable<FastifyServerOptions['logger']> => {
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        'req.headers.x-auth-token',
        'body.password',
        'body.token',
        'body.secret',
        'body.authorization',
        'body.cookie',
        'body.apiKey',
        'body.accessKey',
        'body.account',
        'body.routingNumber',
        'body.bankRoutingNumber',
        'body.accountNumber',
        'body.bankAccountNumber',
        'body.*.password',
        'body.*.token',
        'body.*.secret',
        'body.*.authorization',
        'body.*.cookie',
        'body.*.apiKey',
        'body.*.accessKey',
        'body.*.account',
        'body.*.routingNumber',
        'body.*.bankRoutingNumber',
        'body.*.accountNumber',
        'body.*.bankAccountNumber',
        '*.password',
        '*.token',
        '*.secret',
        '*.authorization',
        '*.cookie',
        '*.apiKey',
        '*.accessKey',
        '*.account',
        '*.routingNumber',
        '*.bankRoutingNumber',
        '*.accountNumber',
        '*.bankAccountNumber'
      ],
      censor: '[REDACTED]'
    },
    messageKey: 'message'
  };
};
