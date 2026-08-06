import { timingSafeEqual } from "node:crypto";
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

const PUBLIC_ROUTES = new Set(["/health"]);
const PUBLIC_PREFIXES = ["/docs"];

function isPublicRoute(request: FastifyRequest): boolean {
  const routeUrl = request.routeOptions?.url ?? request.url;
  if (PUBLIC_ROUTES.has(routeUrl)) return true;
  return PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix));
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isValidApiKey(candidate: string): boolean {
  return config.API_KEYS.some((key) => safeCompare(key, candidate));
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicRoute(request)) {
      return;
    }

    const apiKey = request.headers["x-api-key"];
    if (typeof apiKey !== "string" || !isValidApiKey(apiKey)) {
      await reply.code(401).send({ error: "Unauthorized: missing or invalid X-API-Key header" });
    }
  });
}

export default fp(authPlugin, { name: "auth-plugin" });
