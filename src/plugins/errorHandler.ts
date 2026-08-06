import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

export default fp(async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation error",
        details: error.flatten(),
      });
    }

    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? "Internal server error" : error.message,
    });
  });
});
