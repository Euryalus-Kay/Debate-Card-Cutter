import { RoundWorkspace } from "@/features/rounds/workspace";

export const metadata = { title: "Round" };

export default async function RoundPage({ params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  return <RoundWorkspace roundId={roundId} />;
}
