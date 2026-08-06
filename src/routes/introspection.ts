import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runQuery } from "../db/connectionManager.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const tableParamSchema = z.object({ id: z.string().uuid(), table: z.string().min(1) });
const schemaQuerySchema = z.object({ schema: z.string().min(1).default("public") });

const errorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

const tableSchema = z.object({
  schema: z.string(),
  name: z.string(),
});

const columnSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  default: z.string().nullable(),
});

export const introspectionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/connections/:id/tables", {
    schema: {
      tags: ["schema"],
      summary: "Lista as tabelas de um banco cadastrado (via information_schema)",
      params: idParamSchema,
      querystring: schemaQuerySchema,
      response: { 200: z.array(tableSchema), 404: errorSchema },
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { schema } = request.query;

      const result = await runQuery(
        id,
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        [schema]
      );

      if (!result) {
        return reply.code(404).send({ error: "Connection not found" });
      }

      return result.rows.map((row) => ({
        schema: row.table_schema as string,
        name: row.table_name as string,
      }));
    },
  });

  app.get("/connections/:id/tables/:table/columns", {
    schema: {
      tags: ["schema"],
      summary: "Lista as colunas de uma tabela (via information_schema)",
      params: tableParamSchema,
      querystring: schemaQuerySchema,
      response: { 200: z.array(columnSchema), 404: errorSchema },
    },
    handler: async (request, reply) => {
      const { id, table } = request.params;
      const { schema } = request.query;

      const result = await runQuery(
        id,
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table]
      );

      if (!result) {
        return reply.code(404).send({ error: "Connection not found" });
      }

      return result.rows.map((row) => ({
        name: row.column_name as string,
        dataType: row.data_type as string,
        nullable: row.is_nullable === "YES",
        default: (row.column_default as string | null) ?? null,
      }));
    },
  });
};
