import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["13px", { lineHeight: "20px" }],
      base: ["14px", { lineHeight: "20px" }],
      md: ["16px", { lineHeight: "24px" }],
      lg: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
      xl: ["28px", { lineHeight: "32px", letterSpacing: "-0.02em" }],
      "2xl": ["40px", { lineHeight: "44px", letterSpacing: "-0.025em" }],
    },
    borderRadius: {
      none: "0",
      sm: "6px",
      DEFAULT: "6px",
      md: "10px",
      lg: "14px",
      full: "9999px",
    },
    extend: {
      colors: {
        bg: token("bg"),
        surface: {
          1: token("surface-1"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        text: {
          DEFAULT: token("text"),
          muted: token("text-muted"),
          dim: token("text-dim"),
        },
        accent: {
          DEFAULT: token("accent"),
          fg: token("accent-fg"),
          ink: token("accent-ink"),
        },
        danger: {
          DEFAULT: token("danger"),
          fg: token("danger-fg"),
          ink: token("danger-ink"),
        },
        info: token("info"),
        ok: token("ok"),
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        none: "none",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        DEFAULT: "150ms",
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
      },
      keyframes: {
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        caret: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.9" },
        },
        "collapse-down": {
          from: { height: "0" },
          to: { height: "var(--radix-collapsible-content-height)" },
        },
        "collapse-up": {
          from: { height: "var(--radix-collapsible-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        caret: "caret 1s steps(1) infinite",
        "pulse-soft": "pulse-soft 1.8s ease-in-out infinite",
        "collapse-down": "collapse-down 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "collapse-up": "collapse-up 150ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [animate],
};

export default config;
