"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { BookOpen, FlaskConical, LogOut, Settings, Swords, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { authClient } from "@/client/auth-client";
import { flushAndStopAll } from "@/client/sync/hooks";
import { clearAll, outboxCount } from "@/client/sync/idb";
import { cn, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
}
export interface ShellTeam {
  id: string;
  name: string;
  school: string;
  role: string;
  initials: string;
}

const Ctx = createContext<{ user: ShellUser; team: ShellTeam; teams: ShellTeam[] } | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppShell");
  return v;
}

/**
 * Inside something one team owns (a round), team-scoped calls (cards, library, research) use that team, not
 * the one picked in the sidebar: someone on two teams never reads or saves into the wrong one.
 */
export function TeamScope({ teamId, children }: { teamId: string; children: React.ReactNode }) {
  const app = useApp();
  const team = app.teams.find((t) => t.id === teamId) ?? app.team;
  return <Ctx.Provider value={{ ...app, team }}>{children}</Ctx.Provider>;
}

const NAV = [
  { href: "/rounds", label: "Rounds", icon: Swords },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Remove this account's offline copies from the device (shared computers). */
async function clearDeviceData() {
  await clearAll();
  try {
    navigator.serviceWorker?.controller?.postMessage("clear");
    for (const key of await caches.keys()) if (key.startsWith("clash-sw")) await caches.delete(key);
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
}

function setTeamCookie(id: string) {
  document.cookie = `clash_team=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function AppShell({ user, team, teams, children }: { user: ShellUser; team: ShellTeam; teams: ShellTeam[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const inRound = /^\/rounds\/[^/]+/.test(pathname);
  // The sidebar collapses on entering a round and expands on leaving; the user can toggle in between.
  const [collapsed, setCollapsed] = useState(inRound);
  const [wasInRound, setWasInRound] = useState(inRound);
  if (wasInRound !== inRound) {
    setWasInRound(inRound);
    setCollapsed(inRound);
  }

  function switchTeam(id: string) {
    setTeamCookie(id);
    router.refresh();
  }

  async function signOut() {
    // Send anything not yet saved; never silently discard edits made offline.
    await flushAndStopAll();
    const unsent = await outboxCount();
    if (unsent > 0 && !window.confirm(`${unsent} change${unsent === 1 ? "" : "s"} haven't reached the server yet (are you offline?). Signing out deletes them from this device. Sign out anyway?`)) return;
    await clearDeviceData();
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <Ctx.Provider value={{ user, team, teams }}>
      <div className="flex h-dvh overflow-hidden">
        <aside className={cn("flex shrink-0 flex-col border-r border-line bg-elev transition-[width] duration-150", collapsed ? "w-14" : "w-56")}>
          <div className="flex h-12 items-center gap-2 border-b border-line px-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">C</div>
            {!collapsed ? (
              <Menu>
                <MenuTrigger className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-hover">
                  <span className="truncate text-[13px] font-semibold">{team.name}</span>
                  <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-faint" />
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuLabel>Teams</MenuLabel>
                  {teams.map((t) => (
                    <MenuItem key={t.id} onSelect={() => switchTeam(t.id)}>
                      {t.name}
                      {t.id === team.id ? <span className="ml-auto text-xs text-faint">current</span> : null}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : null}
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-2">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              const item = (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-label={collapsed ? n.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-muted hover:bg-hover hover:text-fg",
                    active && "bg-hover text-fg",
                  )}
                >
                  <n.icon className="size-4 shrink-0" />
                  {!collapsed ? n.label : null}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={n.href} content={n.label} side="right">
                  {item}
                </Tooltip>
              ) : (
                item
              );
            })}
          </nav>
          <div className="flex flex-col gap-1 border-t border-line p-2">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted hover:bg-hover"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed ? "Collapse" : null}
            </button>
            <Menu>
              <MenuTrigger className="flex h-9 items-center gap-2 rounded-md px-1.5 text-left hover:bg-hover">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">{team.initials || user.name.slice(0, 2).toUpperCase()}</span>
                {!collapsed ? <span className="truncate text-[13px]">{user.name}</span> : null}
              </MenuTrigger>
              <MenuContent align="start">
                <MenuLabel>{user.email}</MenuLabel>
                <MenuSeparator />
                <MenuItem onSelect={signOut}>
                  <LogOut className="size-3.5" /> Sign out
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
