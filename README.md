# BlastRadius

**HackHazards '26 — Neo4j Track (AuraDB) · Developer Tools & Software Infrastructure**

Point it at a TypeScript/JavaScript repo. It parses the code into a **call graph**
stored in **Neo4j AuraDB**, then lets you click any function and instantly see its
**blast radius** — everything that transitively depends on it — with an AI
explanation of what to double-check before you change it.

The killer query is a single variable-length graph traversal:

```cypher
MATCH (t:Function {id: $id})<-[:CALLS*1..6]-(affected:Function)
RETURN DISTINCT affected
```

That "everything up to 6 hops upstream" question is graph-native — awkward to
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
- **Claude (`claude-opus-4-8`)** for the plain-English blast-radius explanation
  (optional — falls back to a deterministic summary without a key)

## Setup

### 1. Create a free AuraDB instance

Go to <https://neo4j.com/product/auradb/> → create a free instance. When it's
provisioned, download/copy the credentials from the **Connect** tab.

### 2. Configure env

```bash
cp .env.example .env.local
```

Fill in `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`. Optionally add
`ANTHROPIC_API_KEY` to enable the AI explanation.

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

## Demo tips

- Show the real graph in the **Neo4j Browser / Bloom** (from AuraDB) alongside the
  app UI so judges see AuraDB doing the work.
- Lead with the `[:CALLS*1..6]` traversal — it's the "you can't do this cleanly in
  SQL" moment.
- Roadmap slide: "TS/JS today, language-agnostic tomorrow via the Language Server
  Protocol."

## How it works

- `scripts/ingest.ts` — loads the target project with ts-morph, walks each source
  file for functions/methods/arrow-function variables, resolves `CALLS` edges
  through the type checker, and writes nodes + relationships to AuraDB with batched
  `UNWIND` statements.
- `src/app/api/graph` — returns the full function call graph for visualization.
- `src/app/api/impact` — runs the blast-radius traversal for a clicked function and
  returns the affected set + an AI explanation.
- `src/components/GraphView.tsx` — the interactive force-directed graph.
