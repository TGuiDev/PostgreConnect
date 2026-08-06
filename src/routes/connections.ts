import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createConnection,
  deleteConnection,
  getConnectionById,
  listConnections,
  updateConnection,
} from "../db/connectionsRepository.js";
import { evictConnection, testConnection, testRawConnection } from "../db/connectionManager.js";
import { toPublicConnection } from "../types.js";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().positive().default(5432),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().default(false),
  readOnly: z.boolean().default(true),
});

const updateSchema = createSchema.partial();

const idParamSchema = z.object({ id: z.string().uuid() });

const publicConnectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  database_name: z.string(),
  username: z.string(),
  ssl: z.boolean(),
  read_only: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});

const errorSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

export const connectionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/connections", {
    schema: {
      tags: ["connections"],
      summary: "Lista bancos cadastrados",
      response: { 200: z.array(publicConnectionSchema) },
    },
    handler: async () => {
      const records = await listConnections();
      return records.map(toPublicConnection);
    },
  });

  app.get("/connections/:id", {
    schema: {
      tags: ["connections"],
      summary: "Detalhe de um banco cadastrado",
      params: idParamSchema,
      response: { 200: publicConnectionSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const record = await getConnectionById(request.params.id);
      if (!record) {
        return reply.code(404).send({ error: "Connection not found" });
      }
      return toPublicConnection(record);
    },
  });

  app.post("/connections", {
    schema: {
      tags: ["connections"],
      summary: "Cadastra um banco (testa a conexao antes de salvar)",
      body: createSchema,
      response: { 201: publicConnectionSchema, 422: errorSchema },
    },
    handler: async (request, reply) => {
      const input = request.body;

      const check = await testRawConnection({
        host: input.host,
        port: input.port,
        database: input.database,
        username: input.username,
        password: input.password,
        ssl: input.ssl,
      });

      if (!check.ok) {
        return reply.code(422).send({ error: "Could not connect to database", details: check.error });
      }

      const record = await createConnection(input);
      return reply.code(201).send(toPublicConnection(record));
    },
  });

  app.put("/connections/:id", {
    schema: {
      tags: ["connections"],
      summary: "Atualiza um banco cadastrado",
      params: idParamSchema,
      body: updateSchema,
      response: { 200: publicConnectionSchema, 404: errorSchema },
    },
    handler: async (request, reply) => {
      const record = await updateConnection(request.params.id, request.body);
      if (!record) {
        return reply.code(404).send({ error: "Connection not found" });
      }
      evictConnection(request.params.id);
      return toPublicConnection(record);
    },
  });

  app.delete("/connections/:id", {
    schema: {
      tags: ["connections"],
      summary: "Remove um banco cadastrado",
      params: idParamSchema,
      response: { 204: z.null(), 404: errorSchema },
    },
    handler: async (request, reply) => {
      const removed = await deleteConnection(request.params.id);
      evictConnection(request.params.id);
      if (!removed) {
        return reply.code(404).send({ error: "Connection not found" });
      }
      return reply.code(204).send(null);
    },
  });

  app.post("/connections/:id/test", {
    schema: {
      tags: ["connections"],
      summary: "Testa conectividade com o banco cadastrado",
      params: idParamSchema,
      response: { 200: z.object({ ok: z.literal(true) }), 422: errorSchema },
    },
    handler: async (request, reply) => {
      const result = await testConnection(request.params.id);
      if (!result.ok) {
        return reply.code(422).send({ error: "Connection test failed", details: result.error });
      }
      return { ok: true as const };
    },
  });
};
