import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect warns during SSR; on the server neither runs anyway.
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
