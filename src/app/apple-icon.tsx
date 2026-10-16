import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/stats/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Full bleed: iOS applies its own rounded mask to touch icons.
export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} radius={0} />, size);
}
