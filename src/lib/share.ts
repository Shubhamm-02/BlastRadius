"use client";

import { toast } from "sonner";

/** The current page URL; carries ?projectId= and ?fn= when set. */
export function shareUrl(): string {
  return window.location.href;
}

export async function copyText(text: string, success: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
