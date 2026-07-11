import Link from "next/link";
import { getDriver } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStats() {
  const session = getDriver().session();
  try {
    // A Neo4j session runs one query at a time — keep these sequential.
    const totals = await session.run(
      "MATCH (e:Event) RETURN e.type AS type, count(*) AS c",
    );
    const visitors = await session.run(
      "MATCH (e:Event) RETURN count(DISTINCT e.anonId) AS v",
    );
    const topRepos = await session.run(
      `MATCH (e:Event {type:'ingest'}) WHERE e.repo IS NOT NULL
       RETURN e.repo AS repo, count(*) AS c ORDER BY c DESC LIMIT 10`,
    );
    const topFns = await session.run(
      `MATCH (e:Event {type:'impact'}) WHERE e.functionId IS NOT NULL
       RETURN e.functionId AS fn, count(*) AS c ORDER BY c DESC LIMIT 10`,
    );
    const recent = await session.run(
      `MATCH (e:Event)
       RETURN e.type AS type, e.repo AS repo, e.functionId AS fn,
              e.anonId AS anon, e.ts AS ts
       ORDER BY e.ts DESC LIMIT 50`,
    );

    const counts: Record<string, number> = {};
    totals.records.forEach((r) => {
      counts[r.get("type") as string] = Number(r.get("c"));
    });

    return {
      ingest: counts.ingest ?? 0,
      impact: counts.impact ?? 0,
      visitors: Number(visitors.records[0]?.get("v") ?? 0),
      topRepos: topRepos.records.map((r) => ({
        repo: r.get("repo") as string,
        c: Number(r.get("c")),
      })),
      topFns: topFns.records.map((r) => ({
        fn: r.get("fn") as string,
        c: Number(r.get("c")),
      })),
      recent: recent.records.map((r) => ({
        type: r.get("type") as string,
        repo: r.get("repo") as string | null,
        fn: r.get("fn") as string | null,
        anon: r.get("anon") as string | null,
        ts: Number(r.get("ts")),
      })),
    };
  } finally {
    await session.close();
  }
}

export default async function StatsPage() {
  let data: Awaited<ReturnType<typeof getStats>> | null = null;
  let error = "";
  try {
    data = await getStats();
  } catch (e) {
    error = String(e);
  }

  return (
    <main style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 22, margin: 0 }}>
          Blast<span style={{ color: "#f59e0b" }}>Radius</span> · Usage
        </h1>
        <Link href="/" style={{ fontSize: 13, color: "#94a3b8" }}>
          ← back to app
        </Link>
      </div>

      {error ? (
        <p style={{ color: "#f87171" }}>Could not load stats: {error}</p>
      ) : data ? (
        <>
          <section
            style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}
          >
            <Stat label="Anonymous visitors" value={data.visitors} />
            <Stat label="Repos analyzed" value={data.ingest} />
            <Stat label="Functions inspected" value={data.impact} />
          </section>

          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <Panel title="Top repos analyzed">
              {data.topRepos.length === 0 ? (
                <Empty />
              ) : (
                data.topRepos.map((r) => (
                  <Line key={r.repo} left={r.repo} right={r.c} />
                ))
              )}
            </Panel>
            <Panel title="Most-inspected functions">
              {data.topFns.length === 0 ? (
                <Empty />
              ) : (
                data.topFns.map((r) => (
                  <Line key={r.fn} left={shortFn(r.fn)} right={r.c} />
                ))
              )}
            </Panel>
          </div>

          <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 10 }}>
            Recent activity
          </h2>
          <div style={{ fontSize: 13 }}>
            {data.recent.length === 0 ? (
              <Empty />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#94a3b8", textAlign: "left" }}>
                    <th style={th}>When</th>
                    <th style={th}>Who</th>
                    <th style={th}>Action</th>
                    <th style={th}>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #1e293b" }}>
                      <td style={td}>{new Date(e.ts).toLocaleString()}</td>
                      <td style={{ ...td, color: "#64748b" }}>
                        {(e.anon ?? "anon").slice(0, 8)}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            color: e.type === "ingest" ? "#38bdf8" : "#fbbf24",
                          }}
                        >
                          {e.type === "ingest" ? "analyzed" : "inspected"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#cbd5e1" }}>
                        {e.type === "ingest" ? e.repo : shortFn(e.fn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

function shortFn(fn: string | null): string {
  if (!fn) return "—";
  const [file, name] = fn.split("#");
  return name ? `${name}  (${file})` : fn;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "#0b1220",
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: "16px 20px",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, minWidth: 300 }}>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>{title}</h2>
      <div
        style={{
          background: "#0b1220",
          border: "1px solid #1e293b",
          borderRadius: 10,
          padding: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Line({ left, right }: { left: string; right: number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "5px 4px",
        fontSize: 13,
        color: "#cbd5e1",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginRight: 12,
        }}
      >
        {left}
      </span>
      <span style={{ color: "#f59e0b", fontWeight: 600 }}>{right}</span>
    </div>
  );
}

function Empty() {
  return (
    <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>No events yet.</p>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "6px 8px" };
