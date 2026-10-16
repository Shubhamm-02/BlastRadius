import { GraphView } from "@/components/GraphView";

export default function Home({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return <GraphView projectHint={typeof searchParams.projectId === "string"} />;
}
