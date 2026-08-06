import { metadataPool } from "./metadataPool.js";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 5432,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  ssl BOOLEAN NOT NULL DEFAULT false,
  read_only BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function runMigrations(): Promise<void> {
  await metadataPool.query(SCHEMA_SQL);
}
