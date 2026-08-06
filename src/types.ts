export interface ConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  database_name: string;
  username: string;
  encrypted_password: string;
  ssl: boolean;
  read_only: boolean;
  created_at: Date;
  updated_at: Date;
}

export type PublicConnection = Omit<ConnectionRecord, "encrypted_password">;

export function toPublicConnection(record: ConnectionRecord): PublicConnection {
  const { encrypted_password: _encryptedPassword, ...publicFields } = record;
  return publicFields;
}
