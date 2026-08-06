import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/errorHandler.js";
import { healthRoutes } from "./routes/health.js";
import { connectionsRoutes } from "./routes/connections.js";
import { queryRoutes } from "./routes/query.js";

async function main(): Promise<void> {
  await runMigrations();

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandlerPlugin);

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "PostgreConnect API",
        description:
          "Proxy de queries sob demanda para multiplos bancos Postgres, com gerenciamento dinamico de conexoes.",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: "apiKey",
            name: "X-API-Key",
            in: "header",
          },
        },
      },
      security: [{ apiKey: [] }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(connectionsRoutes);
  await app.register(queryRoutes);

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
