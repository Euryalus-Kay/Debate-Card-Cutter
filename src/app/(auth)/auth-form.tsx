"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/client/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/rounds";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ageOk, setAgeOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Signing up from a team invite link carries the invite, which production requires.
    const invite = /^\/join\/([^/?#]+)/.exec(next)?.[1];
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, fetchOptions: invite ? { headers: { "x-invite-token": decodeURIComponent(invite) } } : undefined })
        : await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">C</div>
          <h1 className="text-xl font-semibold tracking-tight">{mode === "signup" ? "Create your account" : "Sign in to Clash"}</h1>
          <p className="mt-1 text-[13px] text-muted">Policy debate workspace for you and your partner.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-elev p-5 shadow-[var(--shadow)]">
          {mode === "signup" ? (
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="First Last" />
            </Field>
          ) : null}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 10 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </Field>
          {mode === "signup" ? (
            <label className="flex items-start gap-2 text-[12.5px] text-muted">
              <input type="checkbox" className="mt-0.5" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} required />
              <span>I&apos;m 13 or older, and a parent or guardian knows I use Clash. Clash uses AI (Anthropic&apos;s Claude) to suggest drafts and edits; nothing goes into a speech until you accept it.</span>
            </label>
          ) : null}
          {error ? <p className="rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p> : null}
          <Button type="submit" variant="primary" loading={busy} disabled={mode === "signup" && !ageOk}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13px] text-muted">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link className="text-accent-text hover:underline" href={`/login?next=${encodeURIComponent(next)}`}>
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link className="text-accent-text hover:underline" href={`/signup?next=${encodeURIComponent(next)}`}>
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
