import { Project, Node, ts, type SourceFile } from "ts-morph";
import neo4j, { type Driver } from "neo4j-driver";
import {
  deleteProject,
  deleteProjectData,
  type ProjectSource,
} from "./projects";
import { assertSchema } from "./schema";

const CODE_EXT_RE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;

/** HOFs whose first argument *is* the function a variable names, e.g. `const C = memo(() => …)`. */
const FN_WRAPPERS = new Set(["memo", "forwardRef", "useCallback"]);

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

/**
 * How one function depends on another:
 * - `call`: `f()`, `obj.f()`, `super()`, tagged templates
 * - `jsx`:  `<F />` (class components resolve to `render`, else the constructor)
 * - `new`:  `new F()` (resolves to the constructor, walking `extends` if implicit)
 * - `ref`:  `f` passed by reference, e.g. `arr.map(f)` or `onClick={f}`
 */
export type EdgeKind = "call" | "jsx" | "new" | "ref";

export interface FuncNode {
  id: string; // `${file}#${path}`, e.g. "src/a.ts#Cart.add" or "src/a.ts#outer>inner"
  name: string; // the path without the file or any line disambiguator
  file: string;
  line: number;
}

export interface CallEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface AnalyzeResult {
  files: string[];
  funcs: FuncNode[];
  imports: { from: string; to: string }[];
  calls: CallEdge[];
}

export type AnalyzeStage = "parse" | "resolve";
export type AnalyzeProgress = (
  stage: AnalyzeStage,
  progress: number, // 0..1 within the stage
  detail: string,
) => void;

/**
 * Parse a set of in-memory TS/JS files into a call graph. Shared by the
 * GitHub ingest API route and the local CLI script.
 */
export function analyzeProject(
  inputs: SourceFileInput[],
  onProgress?: AnalyzeProgress,
): AnalyzeResult {
  const steps = analyzeSteps(inputs, onProgress);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * Same as analyzeProject, but yields to the event loop periodically so a
 * streaming response can flush progress events while parsing.
 */
export async function analyzeProjectAsync(
  inputs: SourceFileInput[],
  onProgress?: AnalyzeProgress,
): Promise<AnalyzeResult> {
  const steps = analyzeSteps(inputs, onProgress);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function buildProject(inputs: SourceFileInput[]): Project {
  // Detect the shallowest tsconfig/jsconfig so path aliases (e.g. "@/x")
  // resolve to real files instead of being dropped.
  const configEntry = inputs
    .filter((f) => CONFIG_RE.test(f.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];

  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
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
      // Malformed tsconfig: fall back to plain resolution.
    }
  }

  return new Project({ useInMemoryFileSystem: true, compilerOptions });
}

/** A registered callable before its final (collision-free) id is assigned. */
interface Callable {
  info: FuncNode;
  path: string;
  col: number;
}

const YIELD_MS = 50;

function* analyzeSteps(
  inputs: SourceFileInput[],
  onProgress?: AnalyzeProgress,
): Generator<void, AnalyzeResult, void> {
  const project = buildProject(inputs);
  const rel = (p: string) => p.replace(/^\/+/, "");

  let lastYield = Date.now();
  const due = () => Date.now() - lastYield >= YIELD_MS;

  const codeInputs = inputs.filter((f) => CODE_EXT_RE.test(f.path));
  for (let i = 0; i < codeInputs.length; i++) {
    const f = codeInputs[i];
    const norm = "/" + f.path.replace(/^\/+/, "");
    project.createSourceFile(norm, f.content, { overwrite: true });
    if (due()) {
      onProgress?.("parse", (i / codeInputs.length) * 0.5, `Loaded ${i} files`);
      yield;
      lastYield = Date.now();
    }
  }

  const sourceFiles = project
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile());

  // Keyed by compiler node so lookups don't depend on wrapper identity.
  const byBody = new Map<ts.Node, Callable>(); // function-like node → callable
  const byDecl = new Map<ts.Node, Callable>(); // anything a symbol can point at
  const ctorByClass = new Map<ts.Node, Callable>();
  const renderByClass = new Map<ts.Node, Callable>();
  const accessorKind = new Map<Callable, "get" | "set">();
  const accessorNames = new Set<string>(); // cheap pre-filter for property reads
  const callables: Callable[] = [];
  const files: string[] = [];
  const importKeys = new Set<string>();
  const imports: { from: string; to: string }[] = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const sf = sourceFiles[i];
    const file = rel(sf.getFilePath());
    files.push(file);
    collectCallables(sf, file);

    sf.getImportDeclarations().forEach((imp) => {
      const t = imp.getModuleSpecifierSourceFile();
      if (t && !t.isDeclarationFile()) {
        const to = rel(t.getFilePath());
        const key = `${file}|${to}`;
        if (!importKeys.has(key)) {
          importKeys.add(key);
          imports.push({ from: file, to });
        }
      }
    });

    if (due()) {
      onProgress?.(
        "parse",
        0.5 + (i / sourceFiles.length) * 0.5,
        `Indexed ${callables.length} functions in ${i + 1} files`,
      );
      yield;
      lastYield = Date.now();
    }
  }
  assignIds(callables);
  onProgress?.(
    "parse",
    1,
    `Indexed ${callables.length} functions in ${files.length} files`,
  );

  const edgeKeys = new Set<string>();
  const calls: CallEdge[] = [];

  function addEdges(
    site: Node,
    targetNode: Node,
    kind: EdgeKind,
    keep?: (c: Callable) => boolean,
  ) {
    const from = enclosing(site);
    if (!from) return; // module-level code isn't a function node
    for (const to of targetsOf(targetNode, kind)) {
      if (to === from) continue; // recursion adds nothing to the blast radius
      if (keep && !keep(to)) continue;
      const key = `${from.info.id}|${to.info.id}|${kind}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      calls.push({ from: from.info.id, to: to.info.id, kind });
    }
  }

  /** A function value handed to someone else: `f`, `obj.f`, `this.f.bind(this)`. */
  function addRef(expr: Node | undefined) {
    const e = skipOuterExpressions(expr);
    if (!e) return;
    if (Node.isIdentifier(e) || Node.isPropertyAccessExpression(e)) {
      // Reading a getter invokes it; that's handled as a call below.
      addEdges(e, e, "ref", (c) => !accessorKind.has(c));
    } else if (Node.isCallExpression(e)) {
      const callee = e.getExpression();
      if (
        Node.isPropertyAccessExpression(callee) &&
        callee.getName() === "bind"
      ) {
        addRef(callee.getExpression());
      }
    }
  }

  for (let i = 0; i < sourceFiles.length; i++) {
    sourceFiles[i].forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        addEdges(node, node.getExpression(), "call");
        node.getArguments().forEach(addRef);
      } else if (Node.isNewExpression(node)) {
        addEdges(node, node.getExpression(), "new");
        node.getArguments()?.forEach(addRef);
      } else if (Node.isTaggedTemplateExpression(node)) {
        addEdges(node, node.getTag(), "call");
      } else if (
        Node.isJsxOpeningElement(node) ||
        Node.isJsxSelfClosingElement(node)
      ) {
        addEdges(node, node.getTagNameNode(), "jsx");
      } else if (Node.isJsxAttribute(node)) {
        const init = node.getInitializer();
        if (init && Node.isJsxExpression(init)) addRef(init.getExpression());
      } else if (
        Node.isPropertyAccessExpression(node) &&
        accessorNames.has(node.getName())
      ) {
        // `obj.total` runs a getter, `obj.total = x` a setter, `obj.n += 1` both.
        const use = accessorUse(node);
        addEdges(node, node, "call", (c) => use.has(accessorKind.get(c)!));
      }
      return undefined;
    });

    if (due()) {
      onProgress?.(
        "resolve",
        i / sourceFiles.length,
        `Resolved ${calls.length} edges in ${i + 1}/${sourceFiles.length} files`,
      );
      yield;
      lastYield = Date.now();
    }
  }
  onProgress?.("resolve", 1, `Resolved ${calls.length} edges`);

  return {
    files,
    funcs: callables.map((c) => c.info),
    imports,
    calls,
  };

  function collectCallables(sf: SourceFile, file: string) {
    sf.forEachDescendant((node) => {
      let local: string | undefined;
      let body: Node | undefined;
      let overloads: Node[] = [];

      if (Node.isFunctionDeclaration(node)) {
        if (!node.hasBody()) return undefined; // overload signature / ambient
        local =
          node.getName() ?? (node.hasDefaultKeyword() ? "default" : undefined);
        body = node;
        overloads = node.getOverloads();
      } else if (Node.isMethodDeclaration(node)) {
        if (!node.hasBody()) return undefined; // abstract / overload signature
        const owner = ownerName(node.getParent());
        if (owner) local = `${owner}.${memberName(node.getNameNode())}`;
        body = node;
        overloads = node.getOverloads();
      } else if (Node.isConstructorDeclaration(node)) {
        if (!node.hasBody()) return undefined;
        const cls = node.getParent();
        local = `${className(cls)}.constructor`;
        body = node;
        overloads = node.getOverloads();
      } else if (
        Node.isGetAccessorDeclaration(node) ||
        Node.isSetAccessorDeclaration(node)
      ) {
        if (!node.hasBody()) return undefined;
        const owner = ownerName(node.getParent());
        const prefix = Node.isGetAccessorDeclaration(node) ? "get" : "set";
        if (owner)
          local = `${owner}.${prefix}:${memberName(node.getNameNode())}`;
        body = node;
      } else if (Node.isPropertyDeclaration(node)) {
        body = functionInitializer(node.getInitializer());
        if (body)
          local = `${className(node.getParent())}.${memberName(node.getNameNode())}`;
      } else if (Node.isPropertyAssignment(node)) {
        body = functionInitializer(node.getInitializer());
        const parent = node.getParent();
        const owner = Node.isObjectLiteralExpression(parent)
          ? objectName(parent)
          : undefined;
        // Callbacks in anonymous object literals (e.g. `foo({ onDone: () => … })`)
        // stay attributed to their enclosing function, like inline arrows.
        if (body && owner) local = `${owner}.${memberName(node.getNameNode())}`;
      } else if (Node.isVariableDeclaration(node)) {
        if (Node.isIdentifier(node.getNameNode())) {
          body = functionInitializer(node.getInitializer());
          if (body) local = node.getName();
        }
      } else if (Node.isExportAssignment(node)) {
        body = functionInitializer(node.getExpression());
        if (body) local = "default";
      }

      if (!local || !body) return undefined;

      const parent = enclosing(node.getParent());
      const path = parent ? `${parent.path}>${local}` : local;
      // ts-morph's line helpers rescan the file text; the compiler's line map is cached.
      const pos = ts.getLineAndCharacterOfPosition(
        sf.compilerNode,
        node.getStart(),
      );
      const c: Callable = {
        info: { id: "", name: path, file, line: pos.line + 1 },
        path,
        col: pos.character + 1,
      };
      callables.push(c);
      byBody.set(body.compilerNode, c);
      byDecl.set(node.compilerNode, c);
      byDecl.set(body.compilerNode, c);
      for (const o of overloads) byDecl.set(o.compilerNode, c);

      if (Node.isConstructorDeclaration(node)) {
        ctorByClass.set(node.getParent().compilerNode, c);
      } else if (
        Node.isGetAccessorDeclaration(node) ||
        Node.isSetAccessorDeclaration(node)
      ) {
        accessorKind.set(
          c,
          Node.isGetAccessorDeclaration(node) ? "get" : "set",
        );
        accessorNames.add(node.getName());
      } else if (
        Node.isMethodDeclaration(node) &&
        node.getName() === "render" &&
        !node.isStatic() &&
        isClass(node.getParent())
      ) {
        renderByClass.set(node.getParent().compilerNode, c);
      }
      return undefined;
    });
  }

  /** Innermost registered callable containing `from` (inclusive). */
  function enclosing(from: Node | undefined): Callable | undefined {
    for (let n = from; n; n = n.getParent()) {
      const c = byBody.get(n.compilerNode);
      if (c) return c;
    }
    return undefined;
  }

  /** Registered callables that a callee / tag / reference expression points at. */
  function targetsOf(node: Node, kind: EdgeKind): Callable[] {
    const sym = node.getSymbol();
    if (!sym) return [];
    const aliased = sym.isAlias() ? sym.getAliasedSymbol() : undefined;
    const decls = [
      ...sym.getDeclarations(),
      ...(aliased ? aliased.getDeclarations() : []),
    ];
    const out = new Set<Callable>();
    for (const d of decls) {
      const direct = byDecl.get(d.compilerNode);
      if (direct) {
        out.add(direct);
        continue;
      }
      const cls = classOf(d);
      if (!cls) continue;
      const t =
        kind === "jsx"
          ? (renderByClass.get(cls.compilerNode) ?? constructorOf(cls))
          : constructorOf(cls);
      if (t) out.add(t);
    }
    return [...out];
  }

  /** Explicit constructor of a class, or the nearest one up the `extends` chain. */
  function constructorOf(cls: Node): Callable | undefined {
    let cur: Node | undefined = cls;
    for (let depth = 0; cur && depth < 20; depth++) {
      const c = ctorByClass.get(cur.compilerNode);
      if (c) return c;
      cur =
        Node.isClassDeclaration(cur) || Node.isClassExpression(cur)
          ? cur.getBaseClass()
          : undefined;
    }
    return undefined;
  }
}

/** Give every callable `${file}#${path}`, adding `@line` (then `:col`) on collisions. */
function assignIds(callables: Callable[]) {
  const groups = new Map<string, Callable[]>();
  for (const c of callables) {
    const base = `${c.info.file}#${c.path}`;
    const g = groups.get(base);
    if (g) g.push(c);
    else groups.set(base, [c]);
  }
  for (const [base, group] of groups) {
    if (group.length === 1) {
      group[0].info.id = base;
      continue;
    }
    const perLine = new Map<number, number>();
    for (const c of group) {
      perLine.set(c.info.line, (perLine.get(c.info.line) ?? 0) + 1);
    }
    for (const c of group) {
      c.info.id =
        perLine.get(c.info.line)! > 1
          ? `${base}@${c.info.line}:${c.col}`
          : `${base}@${c.info.line}`;
    }
  }
}

/** Whether a property access reads (get), writes (set) or updates (both) its target. */
function accessorUse(pa: Node): Set<"get" | "set"> {
  const p = pa.getParent();
  if (p && Node.isBinaryExpression(p) && p.getLeft() === pa) {
    const op = p.getOperatorToken().getKind();
    if (op === ts.SyntaxKind.EqualsToken) return new Set(["set"]);
    if (
      op >= ts.SyntaxKind.FirstCompoundAssignment &&
      op <= ts.SyntaxKind.LastCompoundAssignment
    ) {
      return new Set(["get", "set"]);
    }
  }
  if (
    p &&
    (Node.isPrefixUnaryExpression(p) || Node.isPostfixUnaryExpression(p)) &&
    [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
      p.getOperatorToken(),
    )
  ) {
    return new Set(["get", "set"]);
  }
  return new Set(["get"]);
}

function isClass(n: Node | undefined): boolean {
  return !!n && (Node.isClassDeclaration(n) || Node.isClassExpression(n));
}

/** The class a declaration names: `class X {}` or `const X = class {}`. */
function classOf(d: Node): Node | undefined {
  if (isClass(d)) return d;
  if (Node.isVariableDeclaration(d)) {
    const init = skipOuterExpressions(d.getInitializer());
    if (init && Node.isClassExpression(init)) return init;
  }
  return undefined;
}

/** Strip parentheses, `as`, `satisfies`, `!` and `<T>` casts. */
function skipOuterExpressions(n: Node | undefined): Node | undefined {
  while (
    n &&
    (Node.isParenthesizedExpression(n) ||
      Node.isAsExpression(n) ||
      Node.isSatisfiesExpression(n) ||
      Node.isNonNullExpression(n) ||
      Node.isTypeAssertion(n))
  ) {
    n = n.getExpression();
  }
  return n;
}

/** Walk up past wrapper expressions to the node that "owns" an expression. */
function outerParent(n: Node): Node | undefined {
  let p = n.getParent();
  while (
    p &&
    (Node.isParenthesizedExpression(p) ||
      Node.isAsExpression(p) ||
      Node.isSatisfiesExpression(p) ||
      Node.isNonNullExpression(p) ||
      Node.isTypeAssertion(p))
  ) {
    p = p.getParent();
  }
  return p;
}

/** The function an initializer evaluates to, looking through memo()/forwardRef()/useCallback(). */
function functionInitializer(init: Node | undefined): Node | undefined {
  const e = skipOuterExpressions(init);
  if (!e) return undefined;
  if (Node.isArrowFunction(e) || Node.isFunctionExpression(e)) return e;
  if (Node.isCallExpression(e)) {
    const callee = e.getExpression();
    const name = Node.isIdentifier(callee)
      ? callee.getText()
      : Node.isPropertyAccessExpression(callee)
        ? callee.getName()
        : undefined;
    if (name && FN_WRAPPERS.has(name)) {
      return functionInitializer(e.getArguments()[0]);
    }
  }
  return undefined;
}

function memberName(nameNode: Node): string {
  if (
    Node.isStringLiteral(nameNode) ||
    Node.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.getLiteralText();
  }
  return nameNode.getText();
}

function className(cls: Node): string {
  if (Node.isClassDeclaration(cls)) {
    return cls.getName() ?? (cls.hasDefaultKeyword() ? "default" : "anonymous");
  }
  if (Node.isClassExpression(cls)) {
    const p = outerParent(cls);
    if (
      p &&
      Node.isVariableDeclaration(p) &&
      Node.isIdentifier(p.getNameNode())
    ) {
      return p.getName();
    }
    if (p && Node.isExportAssignment(p)) return "default";
    return cls.getName() ?? "anonymous";
  }
  return "anonymous";
}

/** Name of a class or *named* object literal owning a member; undefined if anonymous. */
function ownerName(parent: Node | undefined): string | undefined {
  if (!parent) return undefined;
  if (isClass(parent)) return className(parent);
  if (Node.isObjectLiteralExpression(parent)) return objectName(parent);
  return undefined;
}

/**
 * Dotted name for an object literal that is rooted in a variable, a default
 * export or a class property: `const api = { v1: { get() {} } }` → "api.v1".
 */
function objectName(obj: Node): string | undefined {
  const p = outerParent(obj);
  if (!p) return undefined;
  if (Node.isVariableDeclaration(p)) {
    return Node.isIdentifier(p.getNameNode()) ? p.getName() : undefined;
  }
  if (Node.isExportAssignment(p)) return "default";
  if (Node.isPropertyAssignment(p)) {
    const outer = p.getParent();
    const base = Node.isObjectLiteralExpression(outer)
      ? objectName(outer)
      : undefined;
    return base ? `${base}.${memberName(p.getNameNode())}` : undefined;
  }
  if (Node.isPropertyDeclaration(p)) {
    return `${className(p.getParent())}.${memberName(p.getNameNode())}`;
  }
  return undefined;
}

const WRITE_CHUNK = 2000;

export interface WriteMeta {
  slug: string;
  source: ProjectSource;
  /** Files dropped by size/count limits before analysis. */
  truncated?: boolean;
  skippedFiles?: number;
  commit?: string;
}

export type WriteProgress = (progress: number, detail: string) => void;

/**
 * Write an analyzed project to Neo4j, scoped by projectId so multiple projects
 * coexist in one database without clobbering each other.
 *
 * The (:Project) node is marked `writing` first and flipped to `ready` only
 * after every stage commits; readers ignore projects that aren't ready. Each
 * stage is one transaction of ~2,000-row UNWIND chunks, and a failure deletes
 * whatever was written, so a half-written graph is never visible.
 */
export async function writeGraph(
  driver: Driver,
  projectId: string,
  r: AnalyzeResult,
  meta: WriteMeta,
  onProgress?: WriteProgress,
): Promise<void> {
  await assertSchema(driver);

  await driver.executeQuery(
    `MERGE (p:Project { id: $pid })
     SET p.slug = $slug, p.source = $source, p.status = 'writing',
         p.createdAt = $now`,
    {
      pid: projectId,
      slug: meta.slug,
      source: meta.source,
      now: neo4j.int(Date.now()),
    },
  );

  try {
    // Re-ingesting the same id (the CLI does) replaces the old graph.
    await deleteProjectData(driver, projectId);

    const stages: { label: string; cypher: string; rows: unknown[] }[] = [
      {
        label: "files",
        cypher: "UNWIND $rows AS p MERGE (:File { projectId: $pid, path: p })",
        rows: r.files,
      },
      {
        label: "functions",
        cypher: `UNWIND $rows AS fn
                 MATCH (f:File { projectId: $pid, path: fn.file })
                 MERGE (x:Function { projectId: $pid, id: fn.id })
                 SET x.name = fn.name, x.file = fn.file, x.line = fn.line
                 MERGE (x)-[:DEFINED_IN]->(f)`,
        rows: r.funcs.map((f) => ({ ...f, line: neo4j.int(f.line) })),
      },
      {
        label: "imports",
        cypher: `UNWIND $rows AS im
                 MATCH (a:File { projectId: $pid, path: im.from }),
                       (b:File { projectId: $pid, path: im.to })
                 MERGE (a)-[:IMPORTS]->(b)`,
        rows: r.imports,
      },
      {
        label: "calls",
        cypher: `UNWIND $rows AS c
                 MATCH (a:Function { projectId: $pid, id: c.from }),
                       (b:Function { projectId: $pid, id: c.to })
                 MERGE (a)-[:CALLS { kind: c.kind }]->(b)`,
        rows: r.calls,
      },
    ];

    const totalRows = stages.reduce((n, s) => n + s.rows.length, 0) || 1;
    let doneRows = 0;
    const session = driver.session();
    try {
      for (const stage of stages) {
        const before = doneRows;
        await session.executeWrite(async (tx) => {
          doneRows = before; // executeWrite may retry the whole function
          for (let i = 0; i < stage.rows.length; i += WRITE_CHUNK) {
            const rows = stage.rows.slice(i, i + WRITE_CHUNK);
            await tx.run(stage.cypher, { pid: projectId, rows });
            doneRows += rows.length;
            onProgress?.(
              doneRows / totalRows,
              `Wrote ${Math.min(i + WRITE_CHUNK, stage.rows.length)}/${stage.rows.length} ${stage.label}`,
            );
          }
        });
      }
    } finally {
      await session.close();
    }

    await driver.executeQuery(
      `MATCH (p:Project { id: $pid })
       SET p.status = 'ready', p.files = $files, p.functions = $functions,
           p.imports = $imports, p.calls = $calls,
           p.truncated = $truncated, p.skippedFiles = $skipped,
           p.commit = $commit`,
      {
        pid: projectId,
        files: neo4j.int(r.files.length),
        functions: neo4j.int(r.funcs.length),
        imports: neo4j.int(r.imports.length),
        calls: neo4j.int(r.calls.length),
        truncated: meta.truncated ?? false,
        skipped: neo4j.int(meta.skippedFiles ?? 0),
        commit: meta.commit ?? null,
      },
    );
  } catch (err) {
    // Best effort; the TTL cleanup also sweeps writes that never finished.
    await deleteProject(driver, projectId).catch(() => {});
    throw err;
  }
}
