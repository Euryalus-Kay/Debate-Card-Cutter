"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/client/auth-client";
import { api } from "@/client/api";
import { Button } from "@/components/ui";

export function JoinTeam({ token }: { token: string }) {
  const router = useRouter();
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = `/join/${token}`;
  async function join() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ teamId: string }>("/api/join", { method: "POST", json: { token } });
      document.cookie = `clash_team=${r.teamId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.replace("/rounds");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-elev p-6 text-center">
        <h1 className="text-lg font-semibold">Join your partner&apos;s team</h1>
        {session.isPending ? null : session.data ? (
          <>
            <p className="mt-2 text-[13px] text-muted">Signed in as {session.data.user.email}.</p>
            {error ? <p className="mt-3 text-[13px] text-bad">{error}</p> : null}
            <Button variant="primary" className="mt-4 w-full" onClick={join} loading={busy}>
              Join team
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-muted">Create an account or sign in first, then you&apos;ll come back here.</p>
            <div className="mt-4 flex gap-2">
              <Link className="flex-1" href={`/signup?next=${encodeURIComponent(next)}`}>
                <Button variant="primary" className="w-full">
                  Create account
                </Button>
              </Link>
              <Link className="flex-1" href={`/login?next=${encodeURIComponent(next)}`}>
                <Button className="w-full">Sign in</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
