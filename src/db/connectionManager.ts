import { Pool, type QueryResult } from "pg";
import { config } from "../config.js";
import { decryptSecret } from "./crypto.js";
import { getConnectionById } from "./connectionsRepository.js";
import type { ConnectionRecord } from "../types.js";

interface CachedPool {
  pool: Pool;
  passwordFingerprint: string;
  readOnly: boolean;
  lastUsed: number;
}

const poolCache = new Map<string, CachedPool>();

function buildPool(record: ConnectionRecord): Pool {
  const password = decryptSecret(record.encrypted_password);
  return new Pool({
    host: record.host,
    port: record.port,
    database: record.database_name,
    user: record.username,
    password,
    ssl: record.ssl ? { rejectUnauthorized: false } : undefined,
    max: config.POOL_MAX_CONNECTIONS,
    statement_timeout: config.QUERY_TIMEOUT_MS,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export function evictConnection(id: string): void {
  const cached = poolCache.get(id);
  if (cached) {
    poolCache.delete(id);
    void cached.pool.end().catch(() => {});
  }
}

export async function getPoolForConnection(id: string): Promise<{ pool: Pool; readOnly: boolean } | null> {
  const record = await getConnectionById(id);
  if (!record) {
    evictConnection(id);
    return null;
  }

  const cached = poolCache.get(id);
  if (cached && cached.passwordFingerprint === record.encrypted_password) {
    cached.lastUsed = Date.now();
    return { pool: cached.pool, readOnly: cached.readOnly };
  }

  if (cached) {
    evictConnection(id);
  }

  const pool = buildPool(record);
  poolCache.set(id, {
    pool,
    passwordFingerprint: record.encrypted_password,
    readOnly: record.read_only,
    lastUsed: Date.now(),
  });

  return { pool, readOnly: record.read_only };
}

export async function runQuery(
  id: string,
  sql: string,
  params: unknown[]
): Promise<QueryResult | null> {
  const entry = await getPoolForConnection(id);
  if (!entry) return null;

  const client = await entry.pool.connect();
  try {
    if (entry.readOnly) {
      await client.query("BEGIN TRANSACTION READ ONLY");
    }
    const result = await client.query(sql, params);
    if (entry.readOnly) {
      await client.query("COMMIT");
    }
    return result;
  } catch (err) {
    if (entry.readOnly) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function testConnection(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await runQuery(id, "SELECT 1", []);
    if (!result) return { ok: false, error: "Connection not found" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export interface RawConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export async function testRawConnection(
  cfg: RawConnectionConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 5_000,
  });

  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    await pool.end().catch(() => {});
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, cached] of poolCache.entries()) {
    if (now - cached.lastUsed > config.POOL_IDLE_EVICT_MS) {
      evictConnection(id);
    }
  }
}, 60_000).unref();
