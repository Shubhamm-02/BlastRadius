# BlastRadius

**HackHazards '26 - Neo4j Track (AuraDB) · Developer Tools & Software Infrastructure**

Point it at a TypeScript/JavaScript repo. It parses the code into a **call graph**
stored in **Neo4j AuraDB**, then lets you click any function and instantly see its
**blast radius** - everything that transitively depends on it - with an AI
explanation of what to double-check before you change it.

The killer query is a single graph traversal that returns every caller up to
_N_ hops away, with its minimum distance:

```cypher
MATCH path = ANY SHORTEST (t:Function {id: $id})<-[:CALLS]-{1,6}(affected:Function)
RETURN affected, length(path) AS hops
```

That "everything up to 6 hops upstream, nearest first" question is graph-native -
awkward to impossible to express cleanly in a relational database. That's the
whole point of the track. (`ANY SHORTEST` keeps one shortest path per reachable
function, so it's a breadth-first search rather than an enumeration of every
path; it needs Neo4j 5.21+, which AuraDB runs.)

## Graph model

```
(:Project {id, slug, source, status, createdAt, files, functions, imports, calls,
           truncated, skippedFiles})
(:File {projectId, path})
(:Function {projectId, id, name, file, line})
(:Explanation {projectId, functionId, variant, text, model, createdAt})  // AI cache
(:Event {type, anonId, repo, functionId, projectId, ts})                // analytics

(:File)-[:IMPORTS]->(:File)
(:Function)-[:DEFINED_IN]->(:File)
(:Function)-[:CALLS {kind}]->(:Function)
```

Every node except `Event` is scoped by `projectId`, so many analyses share one
database.

**Function ids** are `${file}#${path}`, where the path encodes nesting:

| Code                                         | id                                                        |
| -------------------------------------------- | --------------------------------------------------------- |
| `function login() {}`                        | `auth.ts#login`                                           |
| `class Cart { add() {} }`                    | `cart.ts#Cart.add`                                        |
| `constructor`, `get total`, `set discount`   | `Cart.constructor`, `Cart.get:total`, `Cart.set:discount` |
| `class C { onClick = () => {} }`             | `C.onClick`                                               |
| `const api = { v1: { get() {} } }`           | `api.v1.get`                                              |
| `function outer() { function inner() {} }`   | `outer>inner`                                             |
| `export default function () {}` / `() => {}` | `default`                                                 |
| two callables with the same path             | suffixed `@line` (then `@line:col`)                       |

**Edge kinds** (`CALLS.kind`):

- `call` - `f()`, `obj.f()`, `super()`, tagged templates, and getter/setter use
- `jsx` - `<Button />` (class components resolve to `render`)
- `new` - `new Cart()` (resolves to the constructor, walking `extends` if implicit)
- `ref` - a function passed by reference: `arr.map(handler)`, `onClick={handler}`

Each call is attributed to the **innermost** registered function containing it.
Anonymous callbacks (e.g. `items.forEach(x => save(x))`) count as their
enclosing function. Module-level code isn't attributed to any function.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Neo4j AuraDB** via `neo4j-driver`
- **ts-morph** for parsing + symbol/call resolution (no hand-rolled AST walking)
- **react-force-graph-2d** for the interactive graph
- **Sarvam AI** (`sarvam-105b`) for the plain-English blast-radius explanation
  (optional; falls back to a deterministic summary without a key)
- **zod** for request validation, **Vitest** for tests

## Setup

### 1. Create a free AuraDB instance

Go to <https://neo4j.com/product/auradb/> → create a free instance. When it's
provisioned, download/copy the credentials from the **Connect** tab.

### 2. Configure env

```bash
cp .env.example .env.local
```

Fill in `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`. Optionally add
`SARVAM_API_KEY` to enable the Sarvam AI explanation. See
[Environment variables](#environment-variables) for the rest.

### 3. Install and migrate

```bash
npm install
npm run db:migrate
```

`db:migrate` creates the constraints and indexes (idempotent, safe to re-run).
It also creates `Project` nodes for graphs ingested by older versions, so their
links keep working. Ingest refuses to run until the migration has been applied.

### 4. Ingest a codebase

Point it at any TS/JS project directory (or a `tsconfig.json`):

```bash
npm run ingest -- /path/to/some/repo
# e.g. ingest this very project:
npm run ingest -- ./src
```

You'll see something like `Parsed 42 files, 310 functions, 128 imports, 540 call edges.`
Re-running the CLI on the same directory replaces that project's graph.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, click any node, and watch the blast radius light up.

## Use it (hosted)

Once deployed (or running locally), you don't need the CLI at all. Two ways to
load a codebase:

- **Public GitHub repo** - paste `owner/repo` (or a full URL) and hit **Analyze**;
  the server checks the repo size, streams the tarball through gunzip, and parses
  it in-memory with ts-morph. A progress bar shows each stage.
- **Upload folder** - pick a local folder in the browser; its `.ts/.js` files are
  sent to the server and parsed (skips `node_modules`/build dirs; ~4 MB cap to stay
  under serverless request-body limits - use a GitHub URL or the CLI for larger).

Files dropped by size limits (2,000 files / 12 MB of source for GitHub, 4 MB for
uploads) are reported in the UI as a partial graph rather than silently ignored.

Then:

- **Search** any function by name/file in the left panel (works even with
  thousands of functions).
- Click it to light up its **blast radius**. Use **Callers / Callees** to switch
  between "what breaks if this changes" and "what this depends on", and **Depth**
  (1-8) to widen or narrow the traversal. The list under the explanation shows
  affected functions nearest-first with their hop distance.
- The "Blast radius" view shows just the affected subgraph; toggle "Full graph"
  for the overview.

Each analysis gets its own `projectId`, so multiple people can use the same
deployment without clobbering each other's graphs. The active project is kept in
the URL (`/?projectId=…`) so it's shareable. Projects expire after
`PROJECT_TTL_DAYS` (default 7).

## API

All errors are JSON `{ "error": { "code": string, "message": string } }`, with
messages safe to show users. Full errors are logged server-side only. Requests
are validated with zod, and `/api/ingest`, `/api/impact` and `/api/explain` are
rate-limited per IP (429 with `Retry-After`).

| Endpoint                | Params                                                                                                                                   | Returns                                                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/ingest`      | JSON `{ repo }` or `{ files: [{path, content}], name?, skipped? }`, optional `anonId`                                                    | `{ projectId, slug, source, stats, truncated, files: {kept, skipped} }`. With `Accept: application/x-ndjson`, streams `{stage, progress, detail}` lines (`fetch` → `extract` → `parse` → `resolve` → `write`), then `{stage:"done", result}` or `{stage:"error", error}` |
| `GET /api/project`      | `projectId`                                                                                                                              | `{ id, slug, source, createdAt, stats, truncated, skippedFiles }`                                                                                                                                                                                                        |
| `GET /api/graph`        | `projectId`                                                                                                                              | `{ nodes: [{id, name, file, line}], links: [{source, target, kinds}] }`                                                                                                                                                                                                  |
| `GET /api/impact`       | `projectId`, `id`, `depth` (1-8, default 6), `direction` (`upstream` = callers, default; `downstream` = callees), `explain=1` (optional) | `{ target, direction, depth, affected: [{id, name, file, line, hops}], total, truncated }`. `affected` is sorted by `hops` and capped at 500 (`truncated: true` beyond that)                                                                                             |
| `GET /api/explain`      | same as `/api/impact`, plus `stream=0` for JSON                                                                                          | Streamed `text/plain` explanation (header `X-Explanation-Source: cache \| llm \| fallback`), or `{ explanation, source }`                                                                                                                                                |
| `GET /api/cron/cleanup` | header `Authorization: Bearer $CRON_SECRET`                                                                                              | `{ ttlDays, deleted, remaining }`                                                                                                                                                                                                                                        |

The explanation sends the model the 40 nearest affected functions plus totals,
times out after 15 s, and is cached in Neo4j per (project, function, direction,
depth). Without `SARVAM_API_KEY`, or if the API fails before answering, a
deterministic summary is returned instead.

## Environment variables

| Variable                                                                               | Required   | Purpose                                                                          |
| -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`                                            | yes        | AuraDB credentials                                                               |
| `SARVAM_API_KEY`                                                                       | no         | Enables AI explanations                                                          |
| `SARVAM_MODEL`                                                                         | no         | Defaults to `sarvam-105b`                                                        |
| `GITHUB_TOKEN`                                                                         | no         | Higher GitHub rate limits / private repos                                        |
| `GITHUB_MAX_REPO_MB`                                                                   | no         | Reject repos over this GitHub-reported size (default 250; includes git history)  |
| `PROJECT_TTL_DAYS`                                                                     | no         | Delete projects older than this (default 7)                                      |
| `CRON_SECRET`                                                                          | for cron   | Bearer secret for `/api/cron/cleanup`; the route rejects all calls without it    |
| `STATS_PASSWORD`                                                                       | for /stats | Basic-auth password for `/stats` (any username); `/stats` is disabled without it |
| `RATE_LIMIT_INGEST_PER_MIN`, `RATE_LIMIT_IMPACT_PER_MIN`, `RATE_LIMIT_EXPLAIN_PER_MIN` | no         | Per-IP limits (defaults 5 / 60 / 20)                                             |

## Deploy to Vercel

1. Push this repo to GitHub (already done for the hackathon).
2. In Vercel: **Add New → Project → Import** this GitHub repo.
3. Add Environment Variables (Production + Preview) from the table above - at
   minimum the Neo4j credentials, plus `CRON_SECRET` and `STATS_PASSWORD`.
4. Run `npm run db:migrate` once against the production database (locally, with
   the production credentials in `.env.local`).
5. Deploy. Routes run on the Node.js runtime; ingest has `maxDuration = 60`.
   `vercel.json` schedules `/api/cron/cleanup` daily at 04:00 UTC (Hobby plans
   allow one daily cron); Vercel sends `CRON_SECRET` automatically.

> Serverless functions have a time limit, so very large repos may time out during
> ingest - fine for demo-sized repos. For big monorepos, run the local CLI instead
> (`npm run ingest -- <path>`) and open the printed `/?projectId=…` link.

> The rate limiter is in-memory, so each serverless instance counts separately.
> It's a speed bump, not a guarantee. `src/lib/rateLimit.ts` defines a
> `RateLimiter` interface shaped like `@upstash/ratelimit` if you need a shared
> limit.

## Development

```bash
npm test             # Vitest: analyzer node/edge sets + server units
npm run typecheck
npm run lint         # next lint (core-web-vitals + typescript)
npm run format       # Prettier (format:check in CI)
```

`examples/sample` is both a demo project and the analyzer's test fixture:
`tests/analyze.test.ts` asserts its exact function and edge sets. GitHub Actions
(`.github/workflows/ci.yml`) runs typecheck, lint, format check, tests and build.

## Demo tips

- Show the real graph in the **Neo4j Browser / Bloom** (from AuraDB) alongside the
  app UI so judges see AuraDB doing the work.
- Lead with the `ANY SHORTEST … {1,6}` traversal - it's the "you can't do this
  cleanly in SQL" moment.
- Roadmap slide: "TS/JS today, language-agnostic tomorrow via the Language Server
  Protocol."

## How it works

- `src/lib/analyze.ts` - the shared core: parses in-memory TS/JS with ts-morph,
  registers callables (functions, methods, constructors, accessors, class-property
  and object-literal functions, nested functions, default exports), resolves
  `call`/`jsx`/`new`/`ref` edges through the type checker (following import
  aliases), and writes a **project-scoped** graph to AuraDB in chunked,
  per-stage transactions. The project only becomes visible once every stage has
  committed. It reads the repo's `tsconfig.json` (`baseUrl` / `paths`) so
  `@/`-style alias imports resolve to real files.
- `src/lib/impact.ts` - the blast-radius traversal (depth, direction, hop
  distance, 500-row cap).
- `src/lib/projects.ts` / `src/lib/schema.ts` - project metadata, labelled
  batch deletes, TTL cleanup, and the migration statements.
- `src/lib/github.ts` - parses a repo reference, checks its size, streams the
  tarball, and extracts TS/JS files in memory (skips `node_modules`, build dirs,
  `.d.ts`), counting anything dropped by the limits.
- `src/lib/ingest.ts` + `src/app/api/ingest` - fetch → analyze → write with
  progress events, streamed as NDJSON or returned as plain JSON.
- `src/lib/explain.ts` + `src/app/api/explain` - streamed, cached AI
  explanations with a deterministic fallback.
- `src/components/` + `src/hooks/` - `GraphView` composes `RepoBar`,
  `FunctionList`, `GraphCanvas` and `DetailsPanel` using the `useProject`,
  `useImpact` and `useIngest` hooks.
- `scripts/ingest.ts` - optional local CLI for large repos; uses the same core.
  `scripts/migrate.ts` - one-time schema setup.
