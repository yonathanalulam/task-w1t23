import { buildApp } from './app.js';
import { closePool } from './lib/db.js';

const start = async (): Promise<void> => {
  const app = await buildApp();

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'shutdown_requested');
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({
      host: '0.0.0.0',
      port: app.config.port
    });
  } catch (error) {
    app.log.error({ err: error }, 'startup_failed');
    process.exit(1);
  }
};

void start();
