# Knowledge Harbor

A personal self-study workspace. Organize what you're learning into **spaces**,
add **sources** (YouTube videos or PDFs), and turn each source into an
interactive study session:

- **YouTube** — live, chunked transcript synced to the player. Click any
  passage to spawn a chat thread about that exact moment.
- **PDFs** — highlight text, leave comments, or spawn a chat thread anchored
  to the selection. Highlights and threads persist per page.
- **Notes** — a per-source Markdown notebook with embedded images and links
  back to your chat threads.
- **Chat threads** — backed by OpenAI's Responses API. PDFs are uploaded as
  `input_file` for full-document context; YouTube threads use the transcript.
  Optional per-thread `web_search` for following up on cited references.
- **Knowledge cards** — distill any thread into a saved card.
- **Graph view** — everything (spaces, sources, threads, cards) rendered as
  a knowledge graph via React Flow.

Single-user app — there's no auth. Designed to run locally or on a private
deployment.

## Stack

- Next.js 16 (App Router) + React 19
- Drizzle ORM on Neon Postgres
- S3-compatible object storage for PDFs and thumbnails
- OpenAI Responses API (chat) + Chat Completions (background tasks)
- `react-pdf` / `pdfjs-dist` for PDF rendering
- `@xyflow/react` for the graph

## Minimal setup

You need three external services: a Postgres database, S3-compatible storage,
and an OpenAI API key.

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env.local`

```bash
# Neon (or any Postgres reachable via the Neon serverless driver)
NEON_DATABASE_URL=postgres://user:pass@host/db

# OpenAI
OPENAI_API_KEY=sk-...

# S3-compatible storage (AWS S3, Cloudflare R2, MinIO, etc.)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=knowledge-harbor
# Optional — set this for non-AWS providers (R2, MinIO, ...)
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
```

> The S3 client uses `forcePathStyle: true`, so it works with MinIO and R2
> out of the box. For real AWS S3 you can omit `S3_ENDPOINT`.

### 3. Push the database schema

```bash
npm run db:push
```

This creates the `spaces`, `sources`, `questions`, `messages`, and
`knowledge_cards` tables defined in `src/lib/db/schema.ts`.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Push the Drizzle schema to Postgres |
| `npm run db:studio` | Open Drizzle Studio against your DB |

## Project layout

```
src/
  app/
    api/              # Route handlers: spaces, sources, questions, messages, knowledge-cards
    page.tsx          # 3-pane shell: Sidebar | CenterPane | RightPanel
  components/
    layout/           # Sidebar, CenterPane, RightPanel
    graph/            # React Flow canvas + custom nodes
    source/           # PDF viewer, YouTube player, transcript, notes, chat
    panels/           # Source / Question / KnowledgeCard / PDFSelection panels
    modals/           # AddSourceModal
  lib/
    db/               # Drizzle schema + client
    openai.ts         # OpenAI client + prompt builders
    s3.ts             # S3 upload / presign / download
    youtube.ts        # Transcript fetching & parsing
    pdfThumbnail.ts   # First-page JPEG render for source cards
```

## Notes on usage

- Adding a YouTube source fetches the transcript automatically.
- Adding a PDF uploads it to S3 and, on first chat, registers it with the
  OpenAI Files API so the model can read the whole document.
- The graph view (`/`) is the home screen — each level (spaces → sources →
  threads/cards) is its own React Flow canvas.
- Navigation state (selected space, source, view mode) is persisted in
  `localStorage` so a refresh lands you where you left off.
