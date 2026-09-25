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

/** All registered syncs (for a global "saved/offline" indicator). */
export function allSyncs(): DocSync[] {
  return [...registry.values()].map((r) => r.sync);
}

export function useDocSync(docId: string | null | undefined): { sync: DocSync | null; snapshot: SyncSnapshot | null } {
  const [sync, setSync] = useState<DocSync | null>(null);
  useEffect(() => {
    if (!docId) {
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
  const cacheRef = useRef<{ version: number; value: T } | null>(null);
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
  return useMemo(() => {
    if (!doc) return null;
    if (cacheRef.current && cacheRef.current.version === version) return cacheRef.current.value;
    const value = selector(doc);
    cacheRef.current = { version, value };
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, version, ...deps]);
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
