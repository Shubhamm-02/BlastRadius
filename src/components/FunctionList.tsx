"use client";

import { useMemo, useState } from "react";
import type { GNode, LoadStatus } from "@/hooks/useProject";
import { ellipsis, inputStyle } from "./styles";

const MAX_SHOWN = 100; // keep huge repos responsive

interface Props {
  nodes: GNode[];
  status: LoadStatus;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Left panel: searchable list of every function in the project. */
export default function FunctionList({
  nodes,
  status,
  selectedId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q
      ? nodes.filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.file.toLowerCase().includes(q),
        )
      : nodes;
    return { total: arr.length, shown: arr.slice(0, MAX_SHOWN) };
  }, [query, nodes]);

  let empty = "";
  if (status === "loading") empty = "Loading functions…";
  else if (status === "error") empty = "Couldn't load this project.";
  else if (nodes.length === 0) empty = "Analyze a repo to list its functions.";

  return (
    <aside
      style={{
        width: 300,
        borderRight: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        background: "#0b1220",
      }}
    >
      <div style={{ padding: "14px 14px 8px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${nodes.length} functions…`}
          style={inputStyle()}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0 6px 12px" }}>
        {empty ? (
          <p style={{ fontSize: 12, color: "#64748b", padding: "0 8px" }}>
            {empty}
          </p>
        ) : (
          <>
            {matches.shown.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                title={`${n.name} — ${n.file}${n.line ? `:${n.line}` : ""}`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  marginBottom: 2,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: n.id === selectedId ? "#1e293b" : "transparent",
                  color: n.id === selectedId ? "#f87171" : "#cbd5e1",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, ...ellipsis }}>
                  {n.name}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", ...ellipsis }}>
                  {n.file}
                </div>
              </button>
            ))}
            {matches.total > matches.shown.length && (
              <p style={{ fontSize: 11, color: "#64748b", padding: "6px 8px" }}>
                Showing {matches.shown.length} of {matches.total} — refine your
                search.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
