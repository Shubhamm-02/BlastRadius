import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import neo4j from "neo4j-driver";
import { analyzeProject, writeGraph, type SourceFileInput } from "../src/lib/analyze";

// Reuse the same credentials the Next app uses.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error(
      "Usage: npm run ingest -- <path-to-project-dir-or-tsconfig.json>",
    );
    process.exit(1);
  }

  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.error(
      "Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD. Add them to .env.local.",
    );
    process.exit(1);
  }

  const resolved = path.resolve(target);
  const baseDir = statSync(resolved).isDirectory()
    ? resolved
    : path.dirname(resolved);

  // Read all TS/JS files under baseDir into memory.
  const inputs: SourceFileInput[] = readdirSync(baseDir, { recursive: true })
    .map((e) => String(e))
    .filter(
      (e) =>
        CODE_EXT.test(e) &&
        !e.includes("node_modules") &&
        !e.endsWith(".d.ts"),
    )
    .map((relPath) => ({
      path: relPath.split(path.sep).join("/"),
      content: readFileSync(path.join(baseDir, relPath), "utf8"),
    }));

  const result = analyzeProject(inputs);
  console.log(
    `Parsed ${result.files.length} files, ${result.funcs.length} functions, ${result.imports.length} imports, ${result.calls.length} call edges.`,
  );

  const projectId = `cli-${path.basename(baseDir)}`;
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );
  try {
    await writeGraph(driver, projectId, result);
    console.log(`Graph written to AuraDB (projectId: ${projectId}).`);
    console.log(
      `Open: http://localhost:3000/?projectId=${encodeURIComponent(projectId)}`,
    );
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
