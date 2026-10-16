import { Workspace } from "@/components/Workspace";

export default function Home({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <Workspace projectHint={typeof searchParams.projectId === "string"} />;
}
