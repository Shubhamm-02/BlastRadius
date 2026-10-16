import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/stats/StatusScreen";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="No page at this address"
      description="Check the URL, or go back to the app to analyze a repo."
      actions={
        <Button asChild variant="primary">
          <Link href="/">
            <ArrowLeft aria-hidden />
            Back to app
          </Link>
        </Button>
      }
    />
  );
}
