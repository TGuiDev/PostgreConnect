import { Pool } from "pg";
import { config } from "../config.js";

export const metadataPool = new Pool({
  connectionString: config.METADATA_DATABASE_URL,
  max: 5,
});

metadataPool.on("error", (err) => {
  console.error("Unexpected error on metadata pool client", err);
});
