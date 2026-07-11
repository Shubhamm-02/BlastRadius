# BlastRadius

**HackHazards '26 - Neo4j Track (AuraDB) · Developer Tools & Software Infrastructure**

Point it at a TypeScript/JavaScript repo. It parses the code into a **call graph**
stored in **Neo4j AuraDB**, then lets you click any function and instantly see its
**blast radius** - everything that transitively depends on it - with an AI
explanation of what to double-check before you change it.

The killer query is a single variable-length graph traversal:

```cypher
MATCH (t:Function {id: $id})<-[:CALLS*1..6]-(affected:Function)
RETURN DISTINCT affected
```

That "everything up to 6 hops upstream" question is graph-native - awkward to
impossible to express cleanly in a relational database. That's the whole point of
the track.

## Graph model

```
(:File {path})
(:Function {id, name, file, line})

(:File)-[:IMPORTS]->(:File)
(:Function)-[:DEFINED_IN]->(:File)
(:Function)-[:CALLS]->(:Function)
```

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Neo4j AuraDB** via `neo4j-driver`
- **ts-morph** for parsing + symbol/call resolution (no hand-rolled AST walking)
- **react-force-graph-2d** for the interactive graph
- **Sarvam AI** (`sarvam-105b`) for the plain-English blast-radius explanation
  (optional; falls back to a deterministic summary without a key)

## Setup

### 1. Create a free AuraDB instance

Go to <https://neo4j.com/product/auradb/> → create a free instance. When it's
provisioned, download/copy the credentials from the **Connect** tab.

### 2. Configure env

```bash
cp .env.example .env.local
```

Fill in `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`. Optionally add
`SARVAM_API_KEY` to enable the Sarvam AI explanation.

### 3. Install

```bash
npm install
```

### 4. Ingest a codebase

Point it at any TS/JS project directory (or a `tsconfig.json`):

```bash
npm run ingest -- /path/to/some/repo
# e.g. ingest this very project:
npm run ingest -- ./src
```

You'll see something like `Parsed 42 files, 310 functions, 128 imports, 540 call edges.`

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, click any node, and watch the blast radius light up.

## Use it (hosted)

Once deployed (or running locally), you don't need the CLI at all. Two ways to
load a codebase:

- **Public GitHub repo** - paste `owner/repo` (or a full URL) and hit **Analyze**;
  the server downloads the repo tarball and parses it in-memory with ts-morph.
- **Upload folder** - pick a local folder in the browser; its `.ts/.js` files are
  sent to the server and parsed (skips `node_modules`/build dirs; ~4 MB cap to stay
  under serverless request-body limits - use a GitHub URL or the CLI for larger).

Either way you get a project-scoped call graph in AuraDB. Then:

- **Search** any function by name/file in the left panel (works even with
  thousands of functions).
- Click it to light up its **blast radius** - the "Blast radius" view shows just
  the affected subgraph; toggle "Full graph" for the overview.

Each analysis gets its own `projectId`, so multiple people can use the same
deployment without clobbering each other's graphs. The active project is kept in
the URL (`/?projectId=…`) so it's shareable.

## Deploy to Vercel

1. Push this repo to GitHub (already done for the hackathon).
2. In Vercel: **Add New → Project → Import** this GitHub repo.
3. Add Environment Variables (Production + Preview):
   - `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`: your AuraDB credentials
   - `SARVAM_API_KEY`: optional (enables the Sarvam AI explanation)
   - `GITHUB_TOKEN`: optional (raises GitHub rate limits / allows private repos)
4. Deploy. The ingest route runs on the Node.js runtime with `maxDuration = 60`.

> Serverless functions have a time limit, so very large repos may time out during
> ingest - fine for demo-sized repos. For big monorepos, run the local CLI instead
> (`npm run ingest -- <path>`) and open the printed `/?projectId=…` link.

## Demo tips

- Show the real graph in the **Neo4j Browser / Bloom** (from AuraDB) alongside the
  app UI so judges see AuraDB doing the work.
- Lead with the `[:CALLS*1..6]` traversal - it's the "you can't do this cleanly in
  SQL" moment.
- Roadmap slide: "TS/JS today, language-agnostic tomorrow via the Language Server
  Protocol."

## How it works

- `src/lib/analyze.ts` - the shared core: parses in-memory TS/JS with ts-morph
  (functions, methods, arrow-function vars), resolves `CALLS` edges through the type
  checker (following import aliases), and writes a **project-scoped** graph to AuraDB
  with batched `UNWIND` statements. It reads the repo's `tsconfig.json`
  (`baseUrl` / `paths`) so `@/`-style alias imports resolve to real files.
- `src/lib/github.ts` - parses a repo reference, downloads the tarball, and extracts
  its TS/JS files in memory (skips `node_modules`, build dirs, `.d.ts`).
- `src/app/api/ingest` - `POST` a repo → parse → write graph → returns a `projectId`.
- `src/app/api/graph` / `src/app/api/impact` - project-scoped graph fetch and the
  `[:CALLS*1..6]` blast-radius traversal + AI explanation.
- `src/components/GraphView.tsx` - repo input bar + interactive force-directed graph.
- `scripts/ingest.ts` - optional local CLI for large repos; uses the same core.
