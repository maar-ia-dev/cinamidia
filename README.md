# CinaMídia IPTV — Estrutura do Projeto

## Stack
- **Backend**: Fastify + Drizzle ORM + Turso (libsql)
- **Frontend**: Next.js + Tailwind CSS + HLS.js
- **Parser**: iptv-playlist-parser

## Estrutura de Pastas

```
cinamidia-iptv/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── client.ts   # Turso client
│   │   │   │   └── schema.ts   # Drizzle schema
│   │   │   ├── routes/
│   │   │   │   ├── sources.ts  # CRUD de fontes M3U
│   │   │   │   ├── channels.ts # Listagem de canais
│   │   │   │   └── sync.ts     # Sync/parse da M3U
│   │   │   ├── services/
│   │   │   │   └── m3u-parser.ts
│   │   │   └── server.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   └── web/                    # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx        # Home (grid Netflix)
│       │   │   ├── watch/[id]/     # Player
│       │   │   └── admin/          # Painel admin
│       │   └── components/
│       │       ├── ChannelGrid.tsx
│       │       ├── ChannelCard.tsx
│       │       └── VideoPlayer.tsx
│       └── package.json
```

## Instalação

```bash
# Backend
cd apps/api
npm install fastify @fastify/cors drizzle-orm @libsql/client
npm install -D drizzle-kit typescript

# Deps de parse
npm install iptv-playlist-parser node-fetch

# Frontend
cd apps/web
npm install next react react-dom hls.js
npm install -D tailwindcss
```

## Variáveis de Ambiente (api/.env)

```env
TURSO_DATABASE_URL=libsql://seu-db.turso.io
TURSO_AUTH_TOKEN=eyJ...
PORT=3333
```
