"use client";

import { useEffect, useRef, useState } from "react";
import type { IngestProgressEvent } from "@/lib/ingest";
import type { ProjectInfo } from "@/lib/projects";
import { btnStyle, inputStyle } from "./styles";

interface Props {
  ingesting: boolean;
  progress: IngestProgressEvent | null;
  error: string;
  warning: string;
  project: ProjectInfo | null;
  onAnalyze: (repo: string) => void;
  onUpload: (files: FileList) => void;
}

/** Top bar: GitHub repo input, folder upload, ingest progress and status. */
export default function RepoBar(props: Props) {
  const { ingesting, progress, error, warning, project } = props;
  const [repoInput, setRepoInput] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  // <input type="file"> can't take webkitdirectory as a typed JSX prop.
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  const analyze = () => {
    if (!ingesting) props.onAnalyze(repoInput);
  };

  return (
    <header
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        padding: "12px 18px",
        borderBottom: "1px solid #1e293b",
        background: "#0b1220",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>
        Blast<span style={{ color: "#f59e0b" }}>Radius</span>
      </div>
      <input
        value={repoInput}
        onChange={(e) => setRepoInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && analyze()}
        placeholder="Public GitHub repo, e.g. pmndrs/zustand or a github.com URL"
        style={inputStyle(560)}
      />
      <button
        onClick={analyze}
        disabled={ingesting}
        style={btnStyle(ingesting)}
      >
        {ingesting ? "Analyzing…" : "Analyze"}
      </button>
      <span style={{ fontSize: 12, color: "#475569" }}>or</span>
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) props.onUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => folderInputRef.current?.click()}
        disabled={ingesting}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #334155",
          background: "transparent",
          color: "#cbd5e1",
          fontWeight: 600,
          fontSize: 14,
          cursor: ingesting ? "default" : "pointer",
        }}
      >
        Upload folder
      </button>

      {ingesting && progress ? (
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {Math.round(progress.progress * 100)}% · {progress.detail}
        </span>
      ) : (
        project && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {project.slug}: {project.stats.functions} fns ·{" "}
            {project.stats.calls} calls
          </span>
        )
      )}
      {warning && (
        <span style={{ fontSize: 12, color: "#fbbf24" }}>{warning}</span>
      )}
      {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}

      <a
        href="/stats"
        style={{
          marginLeft: "auto",
          fontSize: 13,
          color: "#94a3b8",
          textDecoration: "none",
        }}
      >
        Stats →
      </a>

      {ingesting && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress?.progress ?? 0) * 100)}
          style={{
            position: "absolute",
            left: 0,
            bottom: -1,
            height: 2,
            width: `${Math.max(2, (progress?.progress ?? 0) * 100)}%`,
            background: "#f59e0b",
            transition: "width 200ms ease-out",
          }}
        />
      )}
    </header>
  );
}
