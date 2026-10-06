import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazy database connection.
 * Does NOT throw during build time if env vars are missing.
 * Throws only when the database is actually used at runtime.
 */

let _pool: Pool | null = null;
let _db: NodePgDatabase | null = null;

function getConnectionString(): string {
  const rawUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DIRECT_URL ||
    "";

  if (!rawUrl) {
    throw new Error(
      "A PostgreSQL connection string (SUPABASE_DB_URL, POSTGRES_URL, or DATABASE_URL) is required. Please set it in your environment variables."
    );
  }

  return rawUrl;
}

function createPool(): Pool {
  const connectionString = getConnectionString();

  const isRemoteSsl =
    connectionString.includes("supabase.co") ||
    connectionString.includes("supabase.com") ||
    connectionString.includes("pooler.supabase.com") ||
    (!connectionString.includes("127.0.0.1") &&
      !connectionString.includes("localhost"));

  return new Pool({
    connectionString,
    ssl: isRemoteSsl ? { rejectUnauthorized: false } : undefined,
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = createPool();
  }
  return _pool;
}

export function getDb(): NodePgDatabase {
  if (!_db) {
    _db = drizzle(getPool());
  }
  return _db;
}

// Keep the old named exports for compatibility with existing code
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
});

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
