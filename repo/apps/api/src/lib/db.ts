import { Pool } from 'pg';
import type { AppConfig } from './config.js';

let pool: Pool | null = null;

const createPool = (config: AppConfig): Pool => {
  return new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
    max: 10
  });
};

export const getPool = (config: AppConfig): Pool => {
  if (!pool) {
    pool = createPool(config);
  }

  return pool;
};

export const probeDatabase = async (config: AppConfig): Promise<'up' | 'down'> => {
  try {
    const client = await getPool(config).connect();
    await client.query('SELECT 1');
    client.release();
    return 'up';
  } catch {
    return 'down';
  }
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
