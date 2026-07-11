import { Project, Node, SyntaxKind, ts } from "ts-morph";
import neo4j, { type Driver } from "neo4j-driver";

const CODE_EXT_RE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;

/** Join a path against a dir inside the in-memory FS (handles "." and ".."). */
function joinInMem(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split("/").filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    else if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}

export interface SourceFileInput {
  path: string; // repo-relative, e.g. "src/auth.ts"
  content: string;
}

export interface AnalyzeResult {
  files: string[];
  funcs: { id: string; name: string; file: string; line: number }[];
  imports: { from: string; to: string }[];
  calls: { from: string; to: string }[];
}

/**
 * Parse a set of in-memory TS/JS files into a call graph. Shared by the
 * GitHub ingest API route and the local CLI script.
 */
export function analyzeProject(inputs: SourceFileInput[]): AnalyzeResult {
  // Detect the shallowest tsconfig/jsconfig so path aliases (e.g. "@/x")
  // resolve to real files instead of being dropped.
  const configEntry = inputs
    .filter((f) => CONFIG_RE.test(f.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];

  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };

  if (configEntry) {
    try {
      const parsed = ts.parseConfigFileTextToJson(
        "/" + configEntry.path,
        configEntry.content,
      );
      const co = (parsed.config?.compilerOptions ?? {}) as {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
      const dir = "/" + configEntry.path.split("/").slice(0, -1).join("/");
      if (co.paths) compilerOptions.paths = co.paths;
      // paths without an explicit baseUrl resolve relative to the config dir.
      const rawBase = co.baseUrl ?? (co.paths ? "." : undefined);
      if (rawBase !== undefined) {
        compilerOptions.baseUrl = joinInMem(dir, rawBase);
      }
    } catch {
      // Malformed tsconfig — fall back to plain resolution.
    }
  }

  const project = new Project({ useInMemoryFileSystem: true, compilerOptions });

  for (const f of inputs) {
    if (!CODE_EXT_RE.test(f.path)) continue; // skip tsconfig/json inputs
    const norm = "/" + f.path.replace(/^\/+/, "");
    project.createSourceFile(norm, f.content, { overwrite: true });
  }

  const rel = (p: string) => p.replace(/^\/+/, "");

  interface FuncInfo {
    id: string;
    name: string;
    file: string;
    line: number;
  }
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

  // Pass 1: files, functions, imports.
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (sf.isDeclarationFile()) continue;
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
      if (t && !t.isDeclarationFile()) {
        imports.push({ from: rel(fp), to: rel(t.getFilePath()) });
      }
    });
  }

  // Pass 2: call edges (follow import aliases to real declarations).
  const callKeys = new Set<string>();
  const calls: { from: string; to: string }[] = [];
  for (const [node, info] of funcByNode) {
    node.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
      const sym = call.getExpression().getSymbol();
      if (!sym) return;
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

  return { files: [...files], funcs, imports, calls };
}

/**
 * Write an analyzed project to Neo4j, scoped by projectId so multiple projects
 * coexist in one database without clobbering each other.
 */
export async function writeGraph(
  driver: Driver,
  projectId: string,
  r: AnalyzeResult,
): Promise<void> {
  const session = driver.session();
  try {
    // Drop legacy global-unique constraints if present (they'd conflict with
    // the same file/function id appearing across multiple projects).
    await session.run("DROP CONSTRAINT file_path IF EXISTS");
    await session.run("DROP CONSTRAINT func_id IF EXISTS");

    // Composite uniqueness: id is unique *within* a project.
    await session.run(
      "CREATE CONSTRAINT file_key IF NOT EXISTS FOR (f:File) REQUIRE (f.projectId, f.path) IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT func_key IF NOT EXISTS FOR (fn:Function) REQUIRE (fn.projectId, fn.id) IS UNIQUE",
    );

    // Clear only this project's nodes, then load fresh.
    await session.run("MATCH (n { projectId: $pid }) DETACH DELETE n", {
      pid: projectId,
    });

    await session.run(
      "UNWIND $rows AS p MERGE (:File { projectId: $pid, path: p })",
      { pid: projectId, rows: r.files },
    );

    await session.run(
      `UNWIND $rows AS fn
       MERGE (x:Function { projectId: $pid, id: fn.id })
       SET x.name = fn.name, x.file = fn.file, x.line = fn.line
       WITH x, fn
       MATCH (f:File { projectId: $pid, path: fn.file })
       MERGE (x)-[:DEFINED_IN]->(f)`,
      {
        pid: projectId,
        rows: r.funcs.map((f) => ({ ...f, line: neo4j.int(f.line) })),
      },
    );

    await session.run(
      `UNWIND $rows AS im
       MATCH (a:File { projectId: $pid, path: im.from }),
             (b:File { projectId: $pid, path: im.to })
       MERGE (a)-[:IMPORTS]->(b)`,
      { pid: projectId, rows: r.imports },
    );

    await session.run(
      `UNWIND $rows AS c
       MATCH (a:Function { projectId: $pid, id: c.from }),
             (b:Function { projectId: $pid, id: c.to })
       MERGE (a)-[:CALLS]->(b)`,
      { pid: projectId, rows: r.calls },
    );
  } finally {
    await session.close();
  }
}
