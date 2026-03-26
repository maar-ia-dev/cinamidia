// apps/api/src/db/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Fontes M3U cadastradas pelo admin
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  username: text("username"),
  password: text("password"),
  lastSyncAt: text("last_sync_at"),
  channelCount: integer("channel_count").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// Categorias extraídas da M3U (group-title)
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sourceId: integer("source_id").references(() => sources.id, {
    onDelete: "cascade",
  }),
});

// Canais
export const channels = sqliteTable("channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  logo: text("logo"),
  groupTitle: text("group_title"),
  categoryId: integer("category_id").references(() => categories.id),
  streamUrl: text("stream_url").notNull(),
  tvgId: text("tvg_id"),
  tvgName: text("tvg_name"),
  sourceId: integer("source_id").references(() => sources.id, {
    onDelete: "cascade",
  }),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export type Source = typeof sources.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Category = typeof categories.$inferSelect;
