"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { DocSync, newClientId, type SyncSnapshot } from "./doc-sync";

/**
 * Registry so several components share one DocSync per document, and a doc
 * stays warm briefly after the last component unmounts (fast tab switching).
 */
const registry = new Map<string, { sync: DocSync; refs: number; stopTimer: ReturnType<typeof setTimeout> | null }>();
let sessionClientId: string | null = null;

function clientId(): string {
  if (!sessionClientId) {
    try {
      sessionClientId = sessionStorage.getItem("clash-client-id");
      if (!sessionClientId) {
        sessionClientId = newClientId();
        sessionStorage.setItem("clash-client-id", sessionClientId);
      }
    } catch {
      sessionClientId = newClientId();
    }
  }
  return sessionClientId;
}

function acquire(docId: string): DocSync {
  const hit = registry.get(docId);
  if (hit) {
    hit.refs++;
    if (hit.stopTimer) clearTimeout(hit.stopTimer);
    hit.stopTimer = null;
    return hit.sync;
  }
  const sync = new DocSync(docId, new Y.Doc(), { clientId: clientId() });
  registry.set(docId, { sync, refs: 1, stopTimer: null });
  void sync.start();
  return sync;
}

function release(docId: string) {
  const hit = registry.get(docId);
  if (!hit) return;
  hit.refs--;
  if (hit.refs <= 0) {
    hit.stopTimer = setTimeout(() => {
      hit.sync.stop();
      registry.delete(docId);
    }, 60_000);
  }
}

/** Push any pending local edits for a document to the server now (best effort). */
export async function flushDoc(docId: string): Promise<void> {
  const hit = registry.get(docId);
  if (hit) await hit.sync.flush().catch(() => {});
}

/**
 * Send pending edits and pull everyone else's now, waiting at most `timeoutMs`
 * (offline, the local copy is used as is). Used before applying AI changes so
 * they land on the latest version of the document.
 */
export async function syncDocNow(docId: string, timeoutMs = 4000): Promise<void> {
  const hit = registry.get(docId);
  if (!hit) return;
  const round = hit.sync
    .flush()
    .then(() => hit.sync.sync())
    .catch(() => {});
  await Promise.race([round, new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** Send pending edits for every open document, then stop syncing (sign-out). */
export async function flushAndStopAll(): Promise<void> {
  await Promise.all([...registry.values()].map((r) => r.sync.flush().catch(() => {})));
  for (const [id, r] of registry) {
    if (r.stopTimer) clearTimeout(r.stopTimer);
    r.sync.stop();
    registry.delete(id);
  }
}

/** All registered syncs (for a global "saved/offline" indicator). */
export function allSyncs(): DocSync[] {
  return [...registry.values()].map((r) => r.sync);
}

export function useDocSync(docId: string | null | undefined): { sync: DocSync | null; snapshot: SyncSnapshot | null } {
  const [sync, setSync] = useState<DocSync | null>(null);
  // Acquiring the shared DocSync is a side effect with a matching release, so it lives in an effect;
  // the state update publishes the acquired instance to this component.
  useEffect(() => {
    if (!docId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSync(null);
      return;
    }
    const s = acquire(docId);
    setSync(s);
    return () => release(docId);
  }, [docId]);
  const snapshot = useSyncExternalStore(
    (cb) => (sync ? sync.subscribe(cb) : () => {}),
    () => sync?.snapshot ?? null,
    () => null,
  );
  return { sync, snapshot };
}

/**
 * Derive a value from a Y.Doc and re-render when the doc changes.
 * The selector must be pure; results are cached per doc version.
 */
export function useYDocValue<T>(doc: Y.Doc | null | undefined, selector: (doc: Y.Doc) => T, deps: unknown[] = []): T | null {
  const versionRef = useRef(0);
  const subscribe = useMemo(
    () => (cb: () => void) => {
      if (!doc) return () => {};
      const h = () => {
        versionRef.current++;
        cb();
      };
      doc.on("update", h);
      return () => doc.off("update", h);
    },
    [doc],
  );
  const getSnapshot = () => versionRef.current;
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Recompute only when the document, its version, or the selector's inputs (by identity) change.
  const depsKey = deps.map(identityKey).join("|");
  return useMemo(
    () => (doc ? selector(doc) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, version, depsKey],
  );
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

/** A string that is equal for two values exactly when Object.is would say they are the same. */
function identityKey(v: unknown): string {
  if (v !== null && (typeof v === "object" || typeof v === "function")) {
    let id = objectIds.get(v as object);
    if (!id) {
      id = nextObjectId++;
      objectIds.set(v as object, id);
    }
    return `o${id}`;
  }
  return `${typeof v}:${String(v)}`;
}

/** Aggregate status across all open documents (for the top bar). */
export function useGlobalSyncStatus(): SyncSnapshot["status"] | "idle" {
  const [status, setStatus] = useState<SyncSnapshot["status"] | "idle">("idle");
  useEffect(() => {
    const tick = () => {
      const syncs = allSyncs();
      if (!syncs.length) return setStatus("idle");
      const st = syncs.map((s) => s.snapshot.status);
      setStatus(st.includes("error") ? "error" : st.includes("offline") ? "offline" : st.includes("saving") ? "saving" : st.includes("loading") ? "loading" : "synced");
    };
    tick();
    const t = setInterval(tick, 700);
    return () => clearInterval(t);
  }, []);
  return status;
}
