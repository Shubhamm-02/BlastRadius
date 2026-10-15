import type { CSSProperties } from "react";

export const COLOR_SELECTED = "#ef4444";
export const COLOR_AFFECTED = "#f59e0b";
export const COLOR_IDLE = "#64748b";

export function inputStyle(maxWidth?: number): CSSProperties {
  return {
    width: "100%",
    maxWidth,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 14,
  };
}

export function btnStyle(disabled: boolean): CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#475569" : "#f59e0b",
    color: "#0b1220",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
}

export function segmentStyle(active: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 12,
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: active ? "#f59e0b" : "transparent",
    color: active ? "#0b1220" : "#cbd5e1",
  };
}

export const ellipsis: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
