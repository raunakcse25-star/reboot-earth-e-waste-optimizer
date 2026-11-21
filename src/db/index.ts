import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

const RECHECK_INTERVAL_MS = 60_000;

let sqlReadyCache: boolean | null = null;
let lastProbeAt = 0;
let inFlightProbe: Promise<boolean> | null = null;

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    global._postgresPool.on('error', () => {
      markPrimarySqlUnavailable();
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

export function markPrimarySqlUnavailable() {
  sqlReadyCache = false;
  lastProbeAt = Date.now();
}

export async function isPrimarySqlReady(): Promise<boolean> {
  const sqlHost = process.env.SQL_HOST?.trim();
  if (!sqlHost) {
    return false;
  }

  // When using a Cloud SQL Unix domain socket, verify the socket file exists before opening a connection.
  if (sqlHost.startsWith('/')) {
    const socketPath = path.join(sqlHost, '.s.PGSQL.5432');
    if (!fs.existsSync(socketPath)) {
      sqlReadyCache = false;
      lastProbeAt = Date.now();
      return false;
    }
  }

  const now = Date.now();
  if (sqlReadyCache !== null && now - lastProbeAt < RECHECK_INTERVAL_MS) {
    return sqlReadyCache;
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  inFlightProbe = (async () => {
    try {
      const res = await pool.query<{ tbl: string | null }>(
        "SELECT to_regclass('public.facilities') AS tbl"
      );
      const ready = Boolean(res.rows[0]?.tbl);
      sqlReadyCache = ready;
      lastProbeAt = Date.now();
      return ready;
    } catch {
      sqlReadyCache = false;
      lastProbeAt = Date.now();
      return false;
    } finally {
      inFlightProbe = null;
    }
  })();

  return inFlightProbe;
}
