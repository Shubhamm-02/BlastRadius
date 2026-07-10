import { statSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import neo4j from "neo4j-driver";
import { Project, Node, SyntaxKind } from "ts-morph";

// Reuse the same credentials the Next app uses.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

interface FuncInfo {
  id: string;
  name: string;
  file: string;
  line: number;
}

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

  // Build the ts-morph project from either a directory or a tsconfig.json.
  let project: Project;
  let baseDir: string;
  if (statSync(target).isDirectory()) {
    baseDir = path.resolve(target);
    project = new Project({
      compilerOptions: { allowJs: true },
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths([
      path.join(baseDir, "**/*.{ts,tsx,js,jsx}"),
      "!" + path.join(baseDir, "**/node_modules/**"),
      "!" + path.join(baseDir, "**/*.d.ts"),
    ]);
  } else {
    baseDir = path.dirname(path.resolve(target));
    project = new Project({ tsConfigFilePath: path.resolve(target) });
  }

  const rel = (p: string) =>
    path.relative(baseDir, p).split(path.sep).join("/");

  const funcByNode = new Map<Node, FuncInfo>();
  const funcs: FuncInfo[] = [];
  const files = new Set<string>();
  const imports: { from: string; to: string }[] = [];

  function register(node: Node, name: string, filePath: string) {
    const file = rel(filePath);
    const info: FuncInfo = {
      id: `${file}#${name}`,
      name,
      file,
      line: node.getStartLineNumber(),
    };
    funcByNode.set(node, info);
    funcs.push(info);
  }

  // Pass 1: collect files, functions, and imports.
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (sf.isDeclarationFile() || fp.includes("node_modules")) continue;
    files.add(rel(fp));

    sf.getFunctions().forEach((fn) => {
      const name = fn.getName();
      if (name) register(fn, name, fp);
    });
    sf.getClasses().forEach((cls) =>
      cls.getMethods().forEach((m) => register(m, m.getName(), fp)),
    );
    sf.getVariableDeclarations().forEach((vd) => {
      const init = vd.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        register(vd, vd.getName(), fp);
      }
    });

    sf.getImportDeclarations().forEach((imp) => {
      const t = imp.getModuleSpecifierSourceFile();
      if (t && !t.isDeclarationFile() && !t.getFilePath().includes("node_modules")) {
        imports.push({ from: rel(fp), to: rel(t.getFilePath()) });
      }
    });
  }

  // Pass 2: resolve call edges via the type checker.
  const callKeys = new Set<string>();
  const calls: { from: string; to: string }[] = [];
  for (const [node, info] of funcByNode) {
    node.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
      const sym = call.getExpression().getSymbol();
      if (!sym) return;
      // A call to an imported function resolves to the import alias symbol,
      // whose declaration is the ImportSpecifier — not the real function.
      // Follow the alias to reach the actual declaration.
      const aliased = sym.getAliasedSymbol();
      const decls = [
        ...sym.getDeclarations(),
        ...(aliased ? aliased.getDeclarations() : []),
      ];
      for (const decl of decls) {
        const targetInfo = funcByNode.get(decl);
        if (targetInfo && targetInfo.id !== info.id) {
          const key = `${info.id}|${targetInfo.id}`;
          if (!callKeys.has(key)) {
            callKeys.add(key);
            calls.push({ from: info.id, to: targetInfo.id });
          }
        }
      }
    });
  }

  console.log(
    `Parsed ${files.size} files, ${funcs.length} functions, ${imports.length} imports, ${calls.length} call edges.`,
  );

  // Write everything to AuraDB in batched UNWIND statements.
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );
  const session = driver.session();
  try {
    await session.run("MATCH (n) DETACH DELETE n");
    await session.run(
      "CREATE CONSTRAINT file_path IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT func_id IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE",
    );

    await session.run("UNWIND $rows AS p MERGE (:File {path: p})", {
      rows: [...files],
    });

    await session.run(
      `UNWIND $rows AS fn
       MERGE (x:Function {id: fn.id})
       SET x.name = fn.name, x.file = fn.file, x.line = fn.line
       WITH x, fn
       MATCH (f:File {path: fn.file})
       MERGE (x)-[:DEFINED_IN]->(f)`,
      { rows: funcs.map((f) => ({ ...f, line: neo4j.int(f.line) })) },
    );

    await session.run(
      `UNWIND $rows AS im
       MATCH (a:File {path: im.from}), (b:File {path: im.to})
       MERGE (a)-[:IMPORTS]->(b)`,
      { rows: imports },
    );

    await session.run(
      `UNWIND $rows AS c
       MATCH (a:Function {id: c.from}), (b:Function {id: c.to})
       MERGE (a)-[:CALLS]->(b)`,
      { rows: calls },
    );

    console.log("Graph written to AuraDB. Run `npm run dev` and open the app.");
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
