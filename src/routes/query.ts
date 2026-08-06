import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runQuery } from "../db/connectionManager.js";

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
});

const errorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

const querySuccessSchema = z.object({
  rowCount: z.number().nullable(),
  fields: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
});

export const queryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/connections/:id/query", {
    schema: {
      tags: ["query"],
      summary: "Executa uma query SQL no banco cadastrado e repassa o resultado",
      params: paramsSchema,
      body: bodySchema,
      response: { 200: querySuccessSchema, 400: errorSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { sql, params } = request.body;

      let result;
      try {
        result = await runQuery(id, sql, params);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Query execution failed";
        return reply.code(400).send({ error: "Query execution failed", details: message });
      }

      if (!result) {
        return reply.code(404).send({ error: "Connection not found" });
      }

      return {
        rowCount: result.rowCount,
        fields: result.fields.map((f) => f.name),
        rows: result.rows,
      };
    },
  });
};
