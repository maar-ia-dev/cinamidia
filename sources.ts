// apps/api/src/routes/sources.ts
import { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { sources } from "../db/schema";
import { eq } from "drizzle-orm";
import { syncSource } from "../services/m3u-parser";

export async function sourcesRoutes(app: FastifyInstance) {
  // Listar fontes
  app.get("/sources", async () => {
    return db.select().from(sources);
  });

  // Criar fonte
  app.post<{
    Body: { label: string; url: string; username?: string; password?: string };
  }>("/sources", async (req, reply) => {
    const { label, url, username, password } = req.body;
    const [source] = await db
      .insert(sources)
      .values({ label, url, username, password })
      .returning();
    return reply.status(201).send(source);
  });

  // Deletar fonte
  app.delete<{ Params: { id: string } }>("/sources/:id", async (req, reply) => {
    await db.delete(sources).where(eq(sources.id, Number(req.params.id)));
    return reply.status(204).send();
  });

  // Sincronizar fonte (fetch + parse M3U)
  app.post<{ Params: { id: string } }>("/sources/:id/sync", async (req, reply) => {
    const result = await syncSource(Number(req.params.id));
    return reply.send({ ok: true, ...result });
  });
}
