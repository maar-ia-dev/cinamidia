// apps/api/src/services/m3u-parser.ts
import { db } from "../db/client";
import { sources, categories, channels } from "../db/schema";
import { eq } from "drizzle-orm";

interface M3UChannel {
  name: string;
  logo: string;
  groupTitle: string;
  tvgId: string;
  tvgName: string;
  url: string;
}

function parseM3U(content: string): M3UChannel[] {
  const lines = content.split("\n").map((l) => l.trim());
  const result: M3UChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF")) continue;

    const urlLine = lines[i + 1];
    if (!urlLine || urlLine.startsWith("#")) continue;

    const name = line.split(",").slice(1).join(",").trim();
    const logo = line.match(/tvg-logo="([^"]*)"/)?.[1] ?? "";
    const groupTitle = line.match(/group-title="([^"]*)"/)?.[1] ?? "Sem categoria";
    const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] ?? "";
    const tvgName = line.match(/tvg-name="([^"]*)"/)?.[1] ?? name;

    result.push({ name, logo, groupTitle, tvgId, tvgName, url: urlLine });
  }

  return result;
}

export async function syncSource(sourceId: number) {
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId));

  if (!source) throw new Error("Source not found");

  // Fetch da playlist
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`Falha ao buscar M3U: ${res.status}`);
  const content = await res.text();

  const parsed = parseM3U(content);

  // Limpa canais e categorias antigas desta fonte
  await db.delete(channels).where(eq(channels.sourceId, sourceId));
  await db.delete(categories).where(eq(categories.sourceId, sourceId));

  // Agrupa por categoria
  const groupMap = new Map<string, number>();
  const uniqueGroups = [...new Set(parsed.map((c) => c.groupTitle))];

  for (const groupName of uniqueGroups) {
    const [cat] = await db
      .insert(categories)
      .values({ name: groupName, sourceId })
      .returning();
    groupMap.set(groupName, cat.id);
  }

  // Insere canais em batches de 100
  const batchSize = 100;
  for (let i = 0; i < parsed.length; i += batchSize) {
    const batch = parsed.slice(i, i + batchSize).map((ch) => ({
      name: ch.name,
      logo: ch.logo || null,
      groupTitle: ch.groupTitle,
      categoryId: groupMap.get(ch.groupTitle) ?? null,
      streamUrl: ch.url,
      tvgId: ch.tvgId || null,
      tvgName: ch.tvgName || null,
      sourceId,
    }));
    await db.insert(channels).values(batch);
  }

  // Atualiza metadados da fonte
  await db
    .update(sources)
    .set({
      lastSyncAt: new Date().toISOString(),
      channelCount: parsed.length,
    })
    .where(eq(sources.id, sourceId));

  return { total: parsed.length, categories: uniqueGroups.length };
}
