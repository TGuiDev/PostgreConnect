import { randomUUID } from "node:crypto";
import { metadataPool } from "./metadataPool.js";
import { encryptSecret } from "./crypto.js";
import type { ConnectionRecord } from "../types.js";

export interface CreateConnectionInput {
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  readOnly: boolean;
}

export type UpdateConnectionInput = Partial<CreateConnectionInput>;

export async function listConnections(): Promise<ConnectionRecord[]> {
  const { rows } = await metadataPool.query<ConnectionRecord>(
    "SELECT * FROM connections ORDER BY name ASC"
  );
  return rows;
}

export async function getConnectionById(id: string): Promise<ConnectionRecord | null> {
  const { rows } = await metadataPool.query<ConnectionRecord>(
    "SELECT * FROM connections WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function createConnection(input: CreateConnectionInput): Promise<ConnectionRecord> {
  const id = randomUUID();
  const encryptedPassword = encryptSecret(input.password);

  const { rows } = await metadataPool.query<ConnectionRecord>(
    `INSERT INTO connections
      (id, name, host, port, database_name, username, encrypted_password, ssl, read_only)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.name,
      input.host,
      input.port,
      input.database,
      input.username,
      encryptedPassword,
      input.ssl,
      input.readOnly,
    ]
  );
  return rows[0];
}

export async function updateConnection(
  id: string,
  input: UpdateConnectionInput
): Promise<ConnectionRecord | null> {
  const existing = await getConnectionById(id);
  if (!existing) return null;

  const merged = {
    name: input.name ?? existing.name,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    database: input.database ?? existing.database_name,
    username: input.username ?? existing.username,
    encryptedPassword: input.password ? encryptSecret(input.password) : existing.encrypted_password,
    ssl: input.ssl ?? existing.ssl,
    readOnly: input.readOnly ?? existing.read_only,
  };

  const { rows } = await metadataPool.query<ConnectionRecord>(
    `UPDATE connections SET
      name = $1, host = $2, port = $3, database_name = $4, username = $5,
      encrypted_password = $6, ssl = $7, read_only = $8, updated_at = now()
     WHERE id = $9
     RETURNING *`,
    [
      merged.name,
      merged.host,
      merged.port,
      merged.database,
      merged.username,
      merged.encryptedPassword,
      merged.ssl,
      merged.readOnly,
      id,
    ]
  );
  return rows[0];
}

export async function deleteConnection(id: string): Promise<boolean> {
  const { rowCount } = await metadataPool.query("DELETE FROM connections WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
