# BlastRadius

BlastRadius parses a TypeScript/JavaScript repo into a call graph stored in
Neo4j AuraDB. Select any function to see its blast radius: every function that
transitively calls it (or that it calls), with the hop distance to each, plus a
short summary of what to check before changing it.

Built for the HackHazards '26 Neo4j track (AuraDB).

The core of it is one graph traversal that returns every caller up to _N_ hops
away, with its minimum distance:

```cypher
MATCH path = ANY SHORTEST (t:Function {projectId: $pid, id: $id})<-[:CALLS]-{1,6}(affected:Function)
WHERE affected <> t
RETURN affected, length(path) AS hops
```

`ANY SHORTEST` keeps one shortest path per reachable function, so this is a
breadth-first search rather than an enumeration of every path. It needs Neo4j
5.21+, which AuraDB runs. The same question in SQL takes a recursive CTE with
manual cycle handling.

## Using the app

### Load a codebase

- **GitHub repo**: paste `owner/repo`, a GitHub URL, or a `/tree/<branch>` URL.
  The server checks the repo size, streams the tarball through gunzip and parses
  it in memory. Progress is shown per stage (fetch, extract, parse, resolve,
  write), and an ingest can be cancelled.
- **Local folder**: pick a folder, or drag one onto the window. Only `.ts/.js`
  sources and `tsconfig`/`jsconfig` files are sent; `node_modules`, build output
  and `.git` are skipped. Uploads are capped at 4 MB and 2,000 files to stay
  under serverless request-body limits; use a GitHub URL or the CLI for
  anything larger.

GitHub ingests are capped at 2,000 files / 12 MB of source. Files dropped by a
limit are reported as a partial graph rather than ignored.

### Explore

- Search functions by name or file in the explorer (virtualized, so it stays
  fast with thousands of functions), or jump to one from the command palette.
- Selecting a function highlights its blast radius on the graph, and the
  inspector lists the affected functions nearest-first with their hop distance.
- The graph toolbar switches direction (callers: what breaks if this changes;
  callees: what this depends on), sets depth (1-8 hops), and toggles between the
  focused blast-radius subgraph and the full graph.
- The inspector streams a short summary of what to check. It is cached per
  function, direction and depth.

The active project and function live in the URL, so any view can be shared:
`/?projectId=<id>&fn=<functionId>`. Recently selected functions are remembered
per project in the browser. Projects expire after `PROJECT_TTL_DAYS` (default 7).

The theme follows the system setting, with a toggle to override it. On narrower
screens the side panels open as drawers instead of resizable columns.

### Keyboard shortcuts

| Keys            | Action                                 |
| --------------- | -------------------------------------- |
| `⌘K` / `Ctrl+K` | Command palette                        |
| `/`             | Focus function search                  |
| `Esc`           | Clear selection                        |
| `F`             | Fit graph to view                      |
| `[` / `]`       | Toggle explorer / inspector            |
| `V`             | Toggle focus and full graph            |
| `D`             | Toggle direction (callers and callees) |
| `?`             | Show all shortcuts                     |

## Graph model

```
(:Project {id, slug, source, status, createdAt, files, functions, imports, calls,
           truncated, skippedFiles, commit})
(:File {projectId, path})
(:Function {projectId, id, name, file, line})
(:Explanation {projectId, functionId, variant, text, model, createdAt})  // summary cache
(:Event {type, anonId, repo, functionId, projectId, ts})                // usage analytics

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

- `call`: `f()`, `obj.f()`, `super()`, tagged templates, and getter/setter use
- `jsx`: `<Button />` (class components resolve to `render`)
- `new`: `new Cart()` (resolves to the constructor, walking `extends` if implicit)
- `ref`: a function passed by reference, as in `arr.map(handler)` or `onClick={handler}`

Each call is attributed to the innermost registered function containing it.
Anonymous callbacks (`items.forEach(x => save(x))`) count as their enclosing
function. Module-level code isn't attributed to any function.

## Stack

- Next.js 14 (App Router), TypeScript
- Neo4j AuraDB via `neo4j-driver`
- ts-morph for parsing and symbol/call resolution
- Frontend: Tailwind CSS, Radix primitives, motion, cmdk (command palette),
  sonner (toasts), TanStack Virtual (function list), react-force-graph-2d
  (graph canvas), zustand (state), next-themes, Geist Sans and Mono
- Sarvam (`sarvam-105b`) for the summary; optional, with a deterministic
  fallback when no key is set
- zod for request validation, Vitest for tests

## Setup

### 1. Create an AuraDB instance

Create a free instance at <https://neo4j.com/product/auradb/> and copy the
credentials from its **Connect** tab.

### 2. Configure env

```bash
cp .env.example .env.local
```

Fill in `NEO4J_URI`, `NEO4J_USER` and `NEO4J_PASSWORD`. Set `SARVAM_API_KEY` to
enable model-written summaries. See [Environment variables](#environment-variables)
for the rest.

### 3. Install and migrate

```bash
npm install
npm run db:migrate
```

`db:migrate` creates the constraints and indexes and is safe to re-run. It also
creates `Project` nodes for graphs ingested by older versions, so their links
keep working. Ingest refuses to run until the migration has been applied.

### 4. Ingest from the CLI (optional)

For repos too large for a serverless request, run the CLI against a project
directory or a `tsconfig.json`:

```bash
npm run ingest -- /path/to/repo
```

It prints the counts (`Parsed 42 files, 310 functions, 128 imports, 540 call
edges.`) and a `/?projectId=cli-<dir>` link. Re-running it on the same directory
replaces that project's graph.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000> and paste a repo or drop a folder.

## API

All errors are JSON `{ "error": { "code": string, "message": string } }`, with
messages safe to show users; full errors are logged server-side only. Requests
are validated with zod, and `/api/ingest`, `/api/impact` and `/api/explain` are
rate-limited per IP (429 with `Retry-After`).

| Endpoint                | Params                                                                                                                                   | Returns                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/ingest`      | JSON `{ repo }` or `{ files: [{path, content}], name?, skipped? }`, optional `anonId`                                                    | `{ projectId, slug, source, stats, truncated, files: {kept, skipped} }`. With `Accept: application/x-ndjson`, streams `{stage, progress, detail}` lines (`fetch`, `extract`, `parse`, `resolve`, `write`), then `{stage:"done", result}` or `{stage:"error", error}` |
| `GET /api/project`      | `projectId`                                                                                                                              | `{ id, slug, source, createdAt, stats, truncated, skippedFiles, commit }`                                                                                                                                                                                            |
| `GET /api/graph`        | `projectId`                                                                                                                              | `{ nodes: [{id, name, file, line}], links: [{source, target, kinds}] }`                                                                                                                                                                                              |
| `GET /api/impact`       | `projectId`, `id`, `depth` (1-8, default 6), `direction` (`upstream` = callers, default; `downstream` = callees), `explain=1` (optional) | `{ target, direction, depth, affected: [{id, name, file, line, hops}], total, truncated }`. `affected` is sorted by `hops` and capped at 500 (`truncated: true` beyond that); `explain=1` adds `explanation`                                                         |
| `GET /api/explain`      | same as `/api/impact`, plus `stream=0` for JSON                                                                                          | Streamed `text/plain` summary (header `X-Explanation-Source: cache \| llm \| fallback`), or `{ explanation, source }`                                                                                                                                                |
| `GET /api/cron/cleanup` | header `Authorization: Bearer $CRON_SECRET`                                                                                              | `{ ttlDays, deleted, remaining }`                                                                                                                                                                                                                                    |

Closing the NDJSON stream (or aborting the request) cancels an ingest at its
next progress checkpoint and deletes the partial project.

The summary request sends the model the 40 nearest affected functions plus
totals, times out after 15 s, and is cached in Neo4j per (project, function,
direction, depth). Without `SARVAM_API_KEY`, or if the API fails before
answering, a deterministic summary is returned instead.

## Environment variables

| Variable                                                                               | Required   | Purpose                                                                          |
| -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`                                            | yes        | AuraDB credentials                                                               |
| `SARVAM_API_KEY`                                                                       | no         | Enables model-written summaries                                                  |
| `SARVAM_MODEL`                                                                         | no         | Defaults to `sarvam-105b`                                                        |
| `GITHUB_TOKEN`                                                                         | no         | Higher GitHub rate limits / private repos                                        |
| `GITHUB_MAX_REPO_MB`                                                                   | no         | Reject repos over this GitHub-reported size (default 250; includes git history)  |
| `PROJECT_TTL_DAYS`                                                                     | no         | Delete projects older than this (default 7)                                      |
| `CRON_SECRET`                                                                          | for cron   | Bearer secret for `/api/cron/cleanup`; the route rejects all calls without it    |
| `STATS_PASSWORD`                                                                       | for /stats | Basic-auth password for `/stats` (any username); `/stats` is disabled without it |
| `RATE_LIMIT_INGEST_PER_MIN`, `RATE_LIMIT_IMPACT_PER_MIN`, `RATE_LIMIT_EXPLAIN_PER_MIN` | no         | Per-IP limits (defaults 5 / 60 / 20)                                             |

`/stats` is a password-protected page with usage counts (ingests, impact
queries, distinct visitors, top repos and functions) read from `Event` nodes.

## Deploy to Vercel

1. Import the GitHub repo in Vercel (**Add New → Project → Import**).
2. Add the environment variables above for Production and Preview: at minimum
   the Neo4j credentials, plus `CRON_SECRET` and `STATS_PASSWORD`.
3. Run `npm run db:migrate` once against the production database (locally, with
   the production credentials in `.env.local`).
4. Deploy. Routes run on the Node.js runtime; ingest has `maxDuration = 60`.
   `vercel.json` schedules `/api/cron/cleanup` daily at 04:00 UTC (Hobby plans
   allow one daily cron), and Vercel sends `CRON_SECRET` automatically.

Serverless functions have a time limit, so very large repos may time out during
ingest. For big monorepos, use the CLI (`npm run ingest -- <path>`) and open the
link it prints.

The rate limiter is in-memory, so each serverless instance counts separately.
`src/lib/rateLimit.ts` defines a `RateLimiter` interface shaped like
`@upstash/ratelimit` if you need a shared limit.

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

## Code map

- `src/lib/analyze.ts`: parses in-memory TS/JS with ts-morph, registers
  callables (functions, methods, constructors, accessors, class-property and
  object-literal functions, nested functions, default exports), resolves
  `call`/`jsx`/`new`/`ref` edges through the type checker (following import
  aliases and `tsconfig` `baseUrl`/`paths`), and writes a project-scoped graph
  in chunked, per-stage transactions. A project becomes visible only after
  every stage has committed.
- `src/lib/impact.ts`: the blast-radius traversal (depth, direction, hop
  distance, 500-row cap).
- `src/lib/projects.ts`, `src/lib/schema.ts`: project metadata, labelled batch
  deletes, TTL cleanup and the migration statements.
- `src/lib/github.ts`: repo size check, tarball streaming and in-memory
  extraction, counting anything dropped by the limits.
- `src/lib/ingest.ts`, `src/app/api/ingest`: fetch, analyze and write with
  progress events, streamed as NDJSON or returned as JSON.
- `src/lib/explain.ts`, `src/app/api/explain`: streamed, cached summaries with
  a deterministic fallback.
- `src/state/`: zustand stores for the workspace (selection, direction, depth,
  panels), project data, impact results and ingest progress. `WorkspaceEffects`
  syncs `?projectId=` and `?fn=`, loads data and runs impact queries.
- `src/components/`: `shell` (top bar, resizable panels, drop target),
  `explorer` (search and function list), `graph` (canvas and toolbar),
  `inspector` (blast radius details and summary), `onboarding` (empty state and
  ingest progress), `palette` (command palette, shortcuts), `ui` (Radix-based
  primitives), `stats` (the `/stats` dashboard).
- `scripts/ingest.ts`: local CLI for large repos, using the same core.
  `scripts/migrate.ts`: schema setup and legacy backfill.
