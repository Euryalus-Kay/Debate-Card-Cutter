import { JoinTeam } from "./join-team";

export const metadata = { title: "Join team" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinTeam token={token} />;
}
