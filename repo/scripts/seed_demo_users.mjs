#!/usr/bin/env node
/**
 * Seeds deterministic demo users (one per role) for local/demo environments.
 *
 * Intended to be run inside the api container where argon2 + pg are available:
 *   docker compose exec api node scripts/seed_demo_users.mjs
 *
 * Idempotent: re-running updates the password hash and ensures the role grant.
 */
import argon2 from 'argon2';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'node:fs';

const readEnvOrFile = (name, fallback) => {
  const direct = process.env[name];
  if (direct && direct.trim()) return direct.trim();
  const filePath = process.env[`${name}_FILE`];
  if (filePath && existsSync(filePath)) {
    return readFileSync(filePath, 'utf8').trim();
  }
  return fallback;
};

const host = readEnvOrFile('RRGA_DB_HOST', 'db');
const port = Number(readEnvOrFile('RRGA_DB_PORT', '5432'));
const user = readEnvOrFile('RRGA_DB_USER', readEnvOrFile('PGUSER', 'postgres'));
const password = readEnvOrFile('RRGA_DB_PASSWORD', readEnvOrFile('PGPASSWORD', 'postgres'));
const database = readEnvOrFile('RRGA_DB_NAME', readEnvOrFile('PGDATABASE', 'postgres'));

const demoUsers = [
  { username: 'admin',      password: 'AdminPass1!',      roles: ['administrator'] },
  { username: 'researcher', password: 'ResearcherPass1!', roles: ['researcher'] },
  { username: 'reviewer',   password: 'ReviewerPass1!',   roles: ['reviewer'] },
  { username: 'approver',   password: 'ApproverPass1!',   roles: ['approver'] },
  { username: 'manager',    password: 'ManagerPass1!',    roles: ['resource_manager'] },
  { username: 'clerk',      password: 'ClerkPass1!',      roles: ['finance_clerk'] }
];

const pool = new Pool({ host, port, user, password, database });

const hashPassword = (raw) => argon2.hash(raw, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});

const ensureRoles = async (client) => {
  await client.query(`
    INSERT INTO roles (code, display_name) VALUES
      ('researcher', 'Researcher'),
      ('reviewer', 'Reviewer'),
      ('approver', 'Approver'),
      ('resource_manager', 'Resource Manager'),
      ('finance_clerk', 'Finance Clerk'),
      ('administrator', 'Administrator')
    ON CONFLICT (code) DO NOTHING
  `);
};

const seedUser = async (client, spec) => {
  const passwordHash = await hashPassword(spec.password);
  const inserted = await client.query(
    `
    INSERT INTO users (username, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (username)
      DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id
    `,
    [spec.username, passwordHash]
  );
  const userId = inserted.rows[0].id;
  for (const roleCode of spec.roles) {
    await client.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      SELECT $1, id FROM roles WHERE code = $2
      ON CONFLICT DO NOTHING
      `,
      [userId, roleCode]
    );
  }
  return { userId, username: spec.username, roles: spec.roles };
};

const main = async () => {
  const client = await pool.connect();
  try {
    await ensureRoles(client);
    for (const spec of demoUsers) {
      const result = await seedUser(client, spec);
      console.log(`seeded ${result.username} (${result.roles.join(',')})`);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
