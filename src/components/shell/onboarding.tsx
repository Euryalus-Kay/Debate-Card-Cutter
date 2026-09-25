"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { Button, Field, Input } from "@/components/ui";

export function Onboarding({ userName }: { userName: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/teams", { method: "POST", json: { name, school } });
      document.cookie = `clash_team=${r.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the team.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Welcome, {userName.split(" ")[0]}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Create a team for you and your partner. You&apos;ll get an invite link to send them. If your partner already made a team, open the invite link they sent you instead.
        </p>
        <form onSubmit={create} className="mt-6 flex flex-col gap-4 rounded-xl border border-line bg-elev p-5">
          <Field label="Team name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lab ZS" required />
          </Field>
          <Field label="School (optional)">
            <Input value={school} onChange={(e) => setSchool(e.target.value)} />
          </Field>
          {error ? <p className="text-[13px] text-bad">{error}</p> : null}
          <Button variant="primary" type="submit" loading={busy}>
            Create team
          </Button>
        </form>
      </div>
    </div>
  );
}
