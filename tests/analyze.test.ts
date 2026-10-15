import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeProject, type AnalyzeResult } from "@/lib/analyze";

const SAMPLE_DIR = path.resolve(__dirname, "../examples/sample");

function loadSample() {
  return readdirSync(SAMPLE_DIR).map((f) => ({
    path: f,
    content: readFileSync(path.join(SAMPLE_DIR, f), "utf8"),
  }));
}

const ids = (r: AnalyzeResult) => r.funcs.map((f) => f.id).sort();
const edges = (r: AnalyzeResult) =>
  r.calls.map((c) => `${c.from} -${c.kind}-> ${c.to}`).sort();

describe("analyzeProject on examples/sample", () => {
  const r = analyzeProject(loadSample());

  it("registers exactly the expected functions", () => {
    expect(ids(r)).toEqual(
      [
        // auth.ts / checkout.ts / db.ts / orders.ts / service.ts / users.ts
        "auth.ts#hashPassword",
        "auth.ts#login",
        "auth.ts#validateCredentials",
        "checkout.ts#checkout",
        "db.ts#connect",
        "db.ts#query",
        "orders.ts#getOrders",
        "service.ts#handleDashboard",
        "service.ts#handleLogin",
        "users.ts#getUser",
        "users.ts#listUsers",
        // format.ts: overloads collapse to one node; nesting; duplicates by line
        "format.ts#formatPrice",
        "format.ts#toFixed2",
        "format.ts#buildReceipt",
        "format.ts#buildReceipt>renderLine",
        "format.ts#pickFormatter",
        "format.ts#pickFormatter>fmt@25",
        "format.ts#pickFormatter>fmt@28",
        // cart.ts: constructors, accessors, class-property arrows, static/instance clash
        "cart.ts#Cart.constructor",
        "cart.ts#Cart.get:total",
        "cart.ts#Cart.set:discount",
        "cart.ts#Cart.add",
        "cart.ts#Cart.describe",
        "cart.ts#Cart.isEmpty@28",
        "cart.ts#Cart.isEmpty@33",
        "cart.ts#Cart.forUser",
        "cart.ts#GiftCart.constructor",
        "cart.ts#giftFor",
        "cart.ts#clampPct",
        "cart.ts#applyCoupon",
        // handlers.ts: object-literal properties + anonymous default function
        "handlers.ts#cartHandlers.add",
        "handlers.ts#cartHandlers.checkout",
        "handlers.ts#cartHandlers.nested.clear",
        "handlers.ts#default",
        // routes.ts: anonymous default arrow
        "routes.ts#default",
        // CartView.tsx: components + nested handler
        "CartView.tsx#PriceTag",
        "CartView.tsx#CartView",
        "CartView.tsx#CartView>handleClick",
        "CartView.tsx#Summary",
      ].sort(),
    );
  });

  it("produces exactly the expected edges", () => {
    expect(edges(r)).toEqual(
      [
        "auth.ts#login -call-> auth.ts#hashPassword",
        "auth.ts#login -call-> auth.ts#validateCredentials",
        "auth.ts#validateCredentials -call-> auth.ts#hashPassword",
        "checkout.ts#checkout -call-> auth.ts#login",
        "checkout.ts#checkout -call-> orders.ts#getOrders",
        "db.ts#query -call-> db.ts#connect",
        "orders.ts#getOrders -call-> db.ts#query",
        "orders.ts#getOrders -call-> users.ts#getUser",
        "service.ts#handleDashboard -call-> orders.ts#getOrders",
        "service.ts#handleDashboard -call-> users.ts#getUser",
        "service.ts#handleLogin -call-> auth.ts#login",
        "service.ts#handleLogin -call-> users.ts#getUser",
        "users.ts#getUser -call-> db.ts#query",
        "users.ts#listUsers -call-> db.ts#query",

        "format.ts#formatPrice -call-> format.ts#toFixed2",
        // innermost attribution: renderLine calls formatPrice, buildReceipt doesn't
        "format.ts#buildReceipt>renderLine -call-> format.ts#formatPrice",
        "format.ts#buildReceipt -ref-> format.ts#buildReceipt>renderLine",
        "format.ts#pickFormatter>fmt@25 -call-> format.ts#toFixed2",
        "format.ts#pickFormatter>fmt@28 -call-> format.ts#formatPrice",

        "cart.ts#Cart.constructor -call-> db.ts#query",
        "cart.ts#Cart.set:discount -call-> cart.ts#clampPct",
        "cart.ts#Cart.describe -call-> format.ts#formatPrice",
        "cart.ts#Cart.describe -call-> cart.ts#Cart.get:total",
        "cart.ts#Cart.isEmpty@33 -call-> cart.ts#Cart.isEmpty@28",
        "cart.ts#Cart.forUser -new-> cart.ts#Cart.constructor",
        // super() → base constructor
        "cart.ts#GiftCart.constructor -call-> cart.ts#Cart.constructor",
        // new PromoCart() has no own constructor → Cart's
        "cart.ts#giftFor -new-> cart.ts#Cart.constructor",
        "cart.ts#giftFor -new-> cart.ts#GiftCart.constructor",
        "cart.ts#applyCoupon -call-> cart.ts#Cart.set:discount",
        "cart.ts#applyCoupon -call-> cart.ts#Cart.get:total",

        "handlers.ts#cartHandlers.add -call-> cart.ts#Cart.forUser",
        "handlers.ts#cartHandlers.add -call-> cart.ts#Cart.add",
        "handlers.ts#cartHandlers.checkout -call-> checkout.ts#checkout",
        "handlers.ts#cartHandlers.nested.clear -call-> cart.ts#Cart.forUser",
        "handlers.ts#default -call-> handlers.ts#cartHandlers.add",

        "routes.ts#default -ref-> handlers.ts#default",
        "routes.ts#default -ref-> handlers.ts#cartHandlers.nested.clear",

        "CartView.tsx#PriceTag -call-> format.ts#formatPrice",
        "CartView.tsx#CartView -ref-> CartView.tsx#CartView>handleClick",
        "CartView.tsx#CartView>handleClick -call-> cart.ts#Cart.add",
        "CartView.tsx#CartView -jsx-> CartView.tsx#PriceTag",
        "CartView.tsx#CartView -jsx-> CartView.tsx#Summary",
        "CartView.tsx#Summary -call-> cart.ts#Cart.describe",
      ].sort(),
    );
  });

  it("gives every function a unique id and its own line", () => {
    expect(new Set(ids(r)).size).toBe(r.funcs.length);
    const fmt = r.funcs.find((f) => f.id === "format.ts#formatPrice")!;
    expect(fmt).toMatchObject({
      name: "formatPrice",
      file: "format.ts",
      line: 4,
    });
  });

  it("records file imports", () => {
    expect(r.files.sort()).toEqual(readdirSync(SAMPLE_DIR).sort());
    expect(r.imports).toContainEqual({ from: "routes.ts", to: "handlers.ts" });
    expect(r.imports).toContainEqual({ from: "CartView.tsx", to: "cart.ts" });
  });
});

describe("analyzeProject edge cases", () => {
  it("disambiguates same-line duplicates by column", () => {
    const r = analyzeProject([
      {
        path: "a.ts",
        content: `export function f(x: boolean) { if (x) { const g = () => 1; return g(); } else { const g = () => 2; return g(); } }`,
      },
    ]);
    expect(ids(r)).toEqual(["a.ts#f", "a.ts#f>g@1:48", "a.ts#f>g@1:88"]);
    expect(edges(r)).toEqual([
      "a.ts#f -call-> a.ts#f>g@1:48",
      "a.ts#f -call-> a.ts#f>g@1:88",
    ]);
  });

  it("resolves tsconfig path aliases", () => {
    const r = analyzeProject([
      {
        path: "tsconfig.json",
        content: JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] } },
        }),
      },
      { path: "src/util.ts", content: "export function util() {}" },
      {
        path: "src/main.ts",
        content: `import { util } from "@/util"; export function main() { util(); }`,
      },
    ]);
    expect(edges(r)).toEqual(["src/main.ts#main -call-> src/util.ts#util"]);
    expect(r.imports).toEqual([{ from: "src/main.ts", to: "src/util.ts" }]);
  });

  it("maps JSX on class components to render(), and memo()/forwardRef() vars", () => {
    const r = analyzeProject([
      {
        path: "c.tsx",
        content: `
declare function memo<T>(c: T): T;
class Panel { render() { return helper(); } }
function helper() { return null; }
const Badge = memo(function () { return helper(); });
export default class { mount() { return <><Panel /><Badge /></>; } }
`,
      },
    ]);
    expect(ids(r)).toEqual([
      "c.tsx#Badge",
      "c.tsx#Panel.render",
      "c.tsx#default.mount",
      "c.tsx#helper",
    ]);
    expect(edges(r)).toEqual([
      "c.tsx#Badge -call-> c.tsx#helper",
      "c.tsx#Panel.render -call-> c.tsx#helper",
      "c.tsx#default.mount -jsx-> c.tsx#Badge",
      "c.tsx#default.mount -jsx-> c.tsx#Panel.render",
    ]);
  });

  it("keeps callbacks in anonymous object literals on the enclosing function", () => {
    const r = analyzeProject([
      {
        path: "a.ts",
        content: `
function save() {}
declare function on(opts: { done: () => void }): void;
export function wire() { on({ done: () => save() }); }
save(); // module-level calls have no caller node
`,
      },
    ]);
    expect(ids(r)).toEqual(["a.ts#save", "a.ts#wire"]);
    expect(edges(r)).toEqual(["a.ts#wire -call-> a.ts#save"]);
  });

  it("names nested callables inside methods and dedupes repeated edges", () => {
    const r = analyzeProject([
      {
        path: "a.ts",
        content: `
export class Svc {
  run() {
    const step = () => this.log();
    step(); step();
    [1].forEach(step);
  }
  log() {}
}
`,
      },
    ]);
    expect(ids(r)).toEqual([
      "a.ts#Svc.log",
      "a.ts#Svc.run",
      "a.ts#Svc.run>step",
    ]);
    expect(edges(r)).toEqual([
      "a.ts#Svc.run -call-> a.ts#Svc.run>step",
      "a.ts#Svc.run -ref-> a.ts#Svc.run>step",
      "a.ts#Svc.run>step -call-> a.ts#Svc.log",
    ]);
  });
});
