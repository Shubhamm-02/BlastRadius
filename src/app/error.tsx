"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { StatusScreen } from "@/components/stats/StatusScreen";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      code={error.digest ? `Error ${error.digest}` : "Error"}
      title="This view failed to render"
      description="Details are in the browser console. Try again, or go back to the app."
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Back to app</Link>
          </Button>
        </>
      }
    />
  );
}
