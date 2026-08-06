import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),

  METADATA_DATABASE_URL: z.string().min(1, "METADATA_DATABASE_URL is required"),

  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be a 64-char hex string (32 bytes)")
    .regex(/^[0-9a-fA-F]+$/, "ENCRYPTION_KEY must be hex-encoded"),

  API_KEYS: z
    .string()
    .min(1, "API_KEYS is required (comma-separated list of allowed keys)")
    .transform((value) => value.split(",").map((key) => key.trim()).filter(Boolean)),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  POOL_IDLE_EVICT_MS: z.coerce.number().int().positive().default(10 * 60_000),
  POOL_MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const encryptionKey = Buffer.from(config.ENCRYPTION_KEY, "hex");
