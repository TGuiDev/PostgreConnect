import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/health", {
    schema: {
      tags: ["health"],
      summary: "Health check",
      security: [],
      response: {
        200: z.object({ status: z.literal("ok") }),
      },
    },
    handler: async () => {
      return { status: "ok" as const };
    },
  });
};
