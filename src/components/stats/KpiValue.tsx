"use client";

import { useEffect, useState } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";

// NumberTicker tweens from 0 after mount, so serving the final value would
// flash it, drop to 0 and count back up. Start from 0 and hand over after mount.
export function KpiValue({ value }: { value: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <NumberTicker value={mounted ? value : 0} />;
}
