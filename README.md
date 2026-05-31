# Knowledge Harbor

A personal self-study workspace. Organize what you're learning into **spaces**,
add **sources**, and turn each one into an interactive study session.

### Source types

| Type | What it is |
| --- | --- |
| **YouTube** | Live, chunked transcript synced to the player. Click any passage to spawn a chat thread about that exact moment. |
| **PDF** | Highlight text, leave comments, or spawn a chat thread anchored to the selection. Highlights and threads persist per page. |
| **Note** | A standalone Markdown document — its own source in a space, visible on the graph, edited in the right panel. Use these for scratch notes, lecture write-ups, or anything that isn't tied to a video or paper. |

All source types share the same **graph**, **spaces**, and cross-linking tools below.

### Study tools

- **Notes** — per-source Markdown notebook (Tiptap) with embedded images, `@` mentions of **threads and other sources**, and rich paste from chat (tables, formatting, LaTeX equations).
- **Summaries** — AI-generated structured summaries for YouTube (from transcript) and PDFs (from the document). Cached in the database; the Summary tab reuses them without re-fetching on every visit.
- **Chat threads** — backed by OpenAI's Responses API (`gpt-5.5`). PDFs are uploaded as `input_file` for full-document context; YouTube threads use the transcript. Optional per-thread `web_search` for following up on cited references. Thread titles are AI-generated and **editable inline** in the thread view.
- **Knowledge cards** — distill any thread into a saved card on the graph.
- **Graph view** — spaces → sources → threads/cards, rendered with React Flow. Drag nodes to rearrange; draw **areas** to group questions. Layouts persist per source. Smooth drill-in from a space to a single source.
- **Workspace tabs** — open multiple sources in independent tabs from the top bar. Each tab keeps its own graph position, selected thread, viewer mode, and panel state. Tabs persist across refreshes.

Single-user app — there's no auth. Designed to run locally or on a private deployment.

## Stack

- Next.js 16 (App Router) + React 19
- Drizzle ORM on Neon Postgres
- S3-compatible object storage for PDFs and thumbnails
- OpenAI Responses API (`gpt-5.5` for chat & summaries) + Chat Completions (background tasks)
- Tiptap (notes editor), `react-markdown` + KaTeX (rendering)
- `react-pdf` / `pdfjs-dist` for PDF rendering
- `@xyflow/react` + dagre for the graph

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

Open [http://localhost:3000](http://localhost:3000) (default port **3000**).

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
    panels/           # Source / Question / KnowledgeCard / Note / PDFSelection panels
    modals/           # AddSourceModal (YouTube, PDF, Note tabs)
  lib/
    db/               # Drizzle schema + client
    openai.ts         # OpenAI client + prompt builders
    s3.ts             # S3 upload / presign / download
    youtube.ts        # Transcript fetching & parsing
    pdfThumbnail.ts   # First-page JPEG render for source cards
```

## Notes on usage

- **Adding sources** — use the **+** button in the sidebar. Choose YouTube, PDF, or **Note** (title only; no upload required).
- **YouTube** — transcript is fetched automatically on add. If it fails, open the Transcript tab and use **Retry fetch**.
- **PDF** — uploaded to S3; on first chat, registered with the OpenAI Files API so the model can read the whole document.
- **Notes (source type)** — opens directly in the right-panel editor; no separate viewer pane. Appears on the graph like any other source.
- **Notes (tab)** — available on YouTube/PDF sources. Type `@` to link to a thread or another source. Copy from chat preserves markdown, tables, and equations.
- **Summaries** — generated once per source and stored in the DB. Use **Regenerate** to force a new one.
- **Graph** — home screen (`/`). Three levels: all spaces → sources in a space → threads & cards for one source. Click a source card to drill in; drag nodes or add **Area** frames to organize. Positions save automatically.
- **Tabs** — use **+ New tab** in the header to work on several sources in parallel. Tab title and icon update when you open a source; close with **×** or middle-click. State is saved in `localStorage`.
- **Navigation** — per-tab space/source selection and open tabs persist in `localStorage` across refreshes.
