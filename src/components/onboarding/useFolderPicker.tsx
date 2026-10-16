"use client";

import { useRef } from "react";
import { entriesFromFileList } from "@/lib/upload";
import { useIngest } from "@/state/ingest";

/**
 * A hidden directory input wired to useIngest.uploadEntries. Render `input`
 * once and call `open()` from any button.
 */
export function useFolderPicker() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadEntries = useIngest((s) => s.uploadEntries);

  const input = (
    <input
      // React's types lack webkitdirectory, so it is set on the DOM node.
      ref={(el) => {
        el?.setAttribute("webkitdirectory", "");
        inputRef.current = el;
      }}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        const files = e.currentTarget.files;
        // Copied out first: clearing the value below empties the FileList.
        if (files?.length) void uploadEntries(entriesFromFileList(files));
        // Lets the same folder be picked again after a failed run.
        e.currentTarget.value = "";
      }}
    />
  );

  return { input, open: () => inputRef.current?.click() };
}
