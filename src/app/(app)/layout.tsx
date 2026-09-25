import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app-context";
import { AppShell } from "@/components/shell/app-shell";
import { Onboarding } from "@/components/shell/onboarding";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const user = ctx.user;
  if (!user) redirect("/login");
  const team = ctx.team;
  if (!team) return <Onboarding userName={user.name} />;
  return (
    <AppShell user={user} team={team} teams={[...ctx.teams]}>
      {children}
    </AppShell>
  );
}
