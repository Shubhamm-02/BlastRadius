/*
 * next/og renders with Satori: no Tailwind, no CSS variables, inline styles
 * only. These literals mirror the dark-theme tokens in globals.css.
 */
export const BRAND = {
  bg: "rgb(9, 11, 16)",
  surface: "rgb(14, 17, 24)",
  border: "rgb(33, 39, 52)",
  text: "rgb(232, 235, 241)",
  muted: "rgb(160, 168, 184)",
  dim: "rgb(128, 137, 154)",
  edge: "rgb(50, 58, 76)",
  accent: "rgb(245, 165, 36)",
  accentSoft: "rgba(245, 165, 36, 0.5)",
  danger: "rgb(220, 38, 38)",
};

/** Red target inside amber rings; the favicon and the OG corner mark. */
export function BrandMark({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.surface,
        borderRadius: radius,
      }}
    >
      <div
        style={{
          width: size * 0.76,
          height: size * 0.76,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          border: `${Math.max(1.5, size * 0.055)}px solid ${BRAND.accentSoft}`,
        }}
      >
        <div
          style={{
            width: size * 0.48,
            height: size * 0.48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: `${Math.max(2, size * 0.075)}px solid ${BRAND.accent}`,
          }}
        >
          <div
            style={{
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: "50%",
              background: BRAND.danger,
            }}
          />
        </div>
      </div>
    </div>
  );
}
