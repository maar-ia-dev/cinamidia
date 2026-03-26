// apps/api/src/routes/channels.ts
import { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { channels, categories } from "../db/schema";
import { eq, like, sql } from "drizzle-orm";

export async function channelsRoutes(app: FastifyInstance) {
  // Listar canais com filtro por categoria e busca
  app.get<{
    Querystring: { categoryId?: string; search?: string; page?: string };
  }>("/channels", async (req) => {
    const { categoryId, search, page = "1" } = req.query;
    const limit = 50;
    const offset = (Number(page) - 1) * limit;

    let query = db.select().from(channels).$dynamic();

    if (categoryId) {
      query = query.where(eq(channels.categoryId, Number(categoryId)));
    }
    if (search) {
      query = query.where(like(channels.name, `%${search}%`));
    }

    const rows = await query.limit(limit).offset(offset);
    return rows;
  });

  // Listar categorias
  app.get("/categories", async () => {
    return db
      .select({
        id: categories.id,
        name: categories.name,
        sourceId: categories.sourceId,
        channelCount: sql<number>`count(${channels.id})`.as("channel_count"),
      })
      .from(categories)
      .leftJoin(channels, eq(channels.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(categories.name);
  });

  // Buscar canal por ID (para abrir o player)
  app.get<{ Params: { id: string } }>("/channels/:id", async (req, reply) => {
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, Number(req.params.id)));
    if (!channel) return reply.status(404).send({ error: "Canal não encontrado" });
    return channel;
  });
}
