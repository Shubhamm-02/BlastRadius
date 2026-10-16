"use client";

import { toast } from "sonner";

/** The page URL carries ?projectId= and ?fn=, so it reopens the same view. */
export const copyShareLink = () =>
  copyText(window.location.href, "Link copied");

export async function copyText(text: string, success: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
