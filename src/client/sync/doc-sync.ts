/**
 * DocSync: keeps one Yjs document in sync with the server over HTTPS, with
 * offline recovery through IndexedDB.
 *
 * Guarantees:
 *  - Every local change is written to a durable outbox before it is sent.
 *  - "Synced" is only reported after the server acknowledged every outbox entry.
 *  - Remote updates are idempotent; re-sending or re-receiving is harmless.
 *  - On start, a state-vector handshake pushes anything the server lacks
 *    (repairs gaps if an outbox write was ever lost).
 */

import { EDITOR_SCHEMA_VERSION, SCHEMA_HEADER } from "@/shared/editor/schema";
import * as Y from "yjs";
import * as idb from "./idb";

export type SyncStatus = "loading" | "synced" | "saving" | "offline" | "error";

export interface PresenceEntry {
  clientId: string;
  userId: string;
  state: { section?: string; activity?: "editing" | "viewing"; name?: string };
  seenAt: string;
}

export interface SyncSnapshot {
  status: SyncStatus;
  /** local changes not yet acknowledged by the server */
  pending: number;
  /** whether unsynced changes are stored on this device (IndexedDB available) */
  localPersistence: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** serverTime - Date.now() */
  serverOffsetMs: number;
  others: PresenceEntry[];
  /** true once the document has content from IDB or server */
  ready: boolean;
}

export interface DocSyncOptions {
  clientId?: string;
  endpoint?: (docId: string) => string;
  fetch?: typeof fetch;
  persistence?: boolean;
  /** base poll interval when alone (ms) */
  idleIntervalMs?: number;
  /** poll interval when a collaborator is active (ms) */
  activeIntervalMs?: number;
  hiddenIntervalMs?: number;
  debounceMs?: number;
}

const REMOTE = "remote";
const LOCAL_RESTORE = "idb";

function toB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newClientId(): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return `c_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

interface SyncResponse {
  headSeq: number;
  snapshotSeq: number;
  snapshot?: string;
  updates: { seq: number; u: string }[];
  accepted: number;
  duplicates: number;
  rejected: number;
  serverTime: number;
  presence: PresenceEntry[];
  stateVector?: string;
}

export class DocSync {
  readonly doc: Y.Doc;
  readonly docId: string;
  private opts: Required<Omit<DocSyncOptions, "fetch" | "clientId">> & { fetch: typeof fetch; clientId: string };
  private lastSeq = -1;
  private outbox: idb.OutboxEntry[] = [];
  private nextOutboxId = Date.now();
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 0;
  private stopped = false;
  private presence: { section?: string; activity?: "editing" | "viewing"; name?: string } | null = null;
  private listeners = new Set<(s: SyncSnapshot) => void>();
  private handshakeDone = false;
  private snap: SyncSnapshot = {
    status: "loading",
    pending: 0,
    localPersistence: false,
    lastSyncedAt: null,
    lastError: null,
    serverOffsetMs: 0,
    others: [],
    ready: false,
  };

  constructor(docId: string, doc: Y.Doc = new Y.Doc(), options: DocSyncOptions = {}) {
    this.docId = docId;
    this.doc = doc;
    this.opts = {
      clientId: options.clientId ?? newClientId(),
      endpoint: options.endpoint ?? ((id) => `/api/docs/${encodeURIComponent(id)}/sync`),
      fetch: options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a)),
      persistence: options.persistence ?? true,
      idleIntervalMs: options.idleIntervalMs ?? 3000,
      activeIntervalMs: options.activeIntervalMs ?? 1000,
      hiddenIntervalMs: options.hiddenIntervalMs ?? 15000,
      debounceMs: options.debounceMs ?? 250,
    };
    this.doc.on("update", this.onUpdate);
  }

  get clientId() {
    return this.opts.clientId;
  }

  get snapshot(): SyncSnapshot {
    return this.snap;
  }

  subscribe(fn: (s: SyncSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<SyncSnapshot>) {
    this.snap = { ...this.snap, ...patch, pending: this.outbox.length };
    this.snap.status = this.computeStatus();
    for (const l of this.listeners) l(this.snap);
  }

  private computeStatus(): SyncStatus {
    if (!this.snap.ready) return "loading";
    if (this.inflight && this.outbox.length) return "saving";
    if (this.snap.lastError) {
      return this.snap.lastError.startsWith("offline") ? "offline" : "error";
    }
    if (this.outbox.length) return "saving";
    return "synced";
  }

  async start(): Promise<void> {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("pagehide", this.onPageHide);
    }
    if (this.opts.persistence) {
      const stored = await idb.loadDoc(this.docId);
      const pending = await idb.outboxAll(this.docId);
      const available = (await idb.openDb()) !== null;
      Y.transact(
        this.doc,
        () => {
          if (stored) Y.applyUpdate(this.doc, stored.state, LOCAL_RESTORE);
          for (const e of pending) Y.applyUpdate(this.doc, e.update, LOCAL_RESTORE);
        },
        LOCAL_RESTORE,
      );
      if (stored) this.lastSeq = stored.lastSeq;
      this.outbox = pending.sort((a, b) => a.id - b.id);
      this.nextOutboxId = Math.max(this.nextOutboxId, ...pending.map((p) => p.id + 1));
      this.emit({ localPersistence: available, ready: !!stored || pending.length > 0 });
    }
    await this.sync();
    this.schedule();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.doc.off("update", this.onUpdate);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pagehide", this.onPageHide);
    }
    void this.persistState();
  }

  setPresence(p: { section?: string; activity?: "editing" | "viewing"; name?: string } | null) {
    this.presence = p;
  }

  /** Push everything pending now; resolves when the server acknowledged it (or failed). */
  async flush(): Promise<void> {
    if (this.inflight) await this.inflight;
    if (this.outbox.length) await this.sync();
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || origin === LOCAL_RESTORE) {
      this.scheduleStateSave();
      return;
    }
    const entry: idb.OutboxEntry = { docId: this.docId, id: this.nextOutboxId++, update, createdAt: Date.now() };
    this.outbox.push(entry);
    if (this.opts.persistence) {
      void idb.outboxAdd(entry).then((ok) => {
        if (!ok && this.snap.localPersistence) this.emit({ localPersistence: false });
      });
    }
    this.scheduleStateSave();
    this.emit({});
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.sync(), this.opts.debounceMs);
  };

  private scheduleStateSave() {
    if (!this.opts.persistence || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistState();
    }, 1500);
  }

  private async persistState() {
    if (!this.opts.persistence) return;
    await idb.saveDoc({ docId: this.docId, state: Y.encodeStateAsUpdate(this.doc), lastSeq: this.lastSeq, savedAt: Date.now() });
  }

  private onOnline = () => {
    this.backoffMs = 0;
    void this.sync();
  };

  private onVisibility = () => {
    if (document.visibilityState === "hidden") this.onPageHide();
    else void this.sync();
  };

  private onPageHide = () => {
    void this.persistState();
    if (!this.outbox.length) return;
    // Best effort flush that survives page unload (keepalive bodies are capped at 64 KB).
    const body = this.requestBody(false);
    if (body.length < 60_000) {
      try {
        void this.opts.fetch(this.opts.endpoint(this.docId), { method: "POST", body, headers: { "content-type": "application/json", [SCHEMA_HEADER]: String(EDITOR_SCHEMA_VERSION) }, keepalive: true, credentials: "same-origin" });
      } catch {
        /* outbox remains in IndexedDB and is retried on next load */
      }
    }
  };

  private othersActive(): boolean {
    const cutoff = Date.now() - 20_000;
    return this.snap.others.some((o) => o.state.activity === "editing" && new Date(o.seenAt).getTime() > cutoff);
  }

  private schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    let delay = this.othersActive() ? this.opts.activeIntervalMs : this.opts.idleIntervalMs;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") delay = this.opts.hiddenIntervalMs;
    if (this.backoffMs) delay = Math.max(delay, this.backoffMs);
    this.timer = setTimeout(async () => {
      await this.sync();
      this.schedule();
    }, delay);
  }

  private requestBody(wantStateVector: boolean): string {
    const updates = this.outbox.length ? [toB64(this.outbox.length === 1 ? this.outbox[0].update : Y.mergeUpdates(this.outbox.map((e) => e.update)))] : [];
    return JSON.stringify({ clientId: this.opts.clientId, since: this.lastSeq, updates, presence: this.presence, wantStateVector });
  }

  /** One push+pull round trip. Concurrent calls coalesce. */
  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inflight) return this.inflight.then(() => (this.outbox.length ? this.sync() : undefined));
    this.inflight = this.doSync().finally(() => {
      this.inflight = null;
      this.emit({});
    });
    this.emit({});
    return this.inflight;
  }

  private async doSync(): Promise<void> {
    const sending = this.outbox.map((e) => e.id);
    const wantSV = !this.handshakeDone;
    const started = Date.now();
    let res: Response;
    try {
      res = await this.opts.fetch(this.opts.endpoint(this.docId), {
        method: "POST",
        body: this.requestBody(wantSV),
        headers: { "content-type": "application/json", [SCHEMA_HEADER]: String(EDITOR_SCHEMA_VERSION) },
        credentials: "same-origin",
      });
    } catch {
      this.backoffMs = Math.min(30_000, Math.max(1000, this.backoffMs * 2 || 1000));
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.emit({ lastError: offline ? "offline: no network connection" : "offline: server unreachable" });
      return;
    }
    if (!res.ok) {
      this.backoffMs = Math.min(30_000, Math.max(2000, this.backoffMs * 2 || 2000));
      let msg = `HTTP ${res.status}`;
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {
        /* ignore */
      }
      if (res.status === 426) this.backoffMs = 60_000; // an older build: only a reload fixes it
      this.emit({ lastError: res.status === 401 ? "Signed out — sign in again to sync. Your edits are kept on this device." : msg });
      return;
    }
    const data = (await res.json()) as SyncResponse;
    const rtt = Date.now() - started;
    this.backoffMs = 0;

    Y.transact(
      this.doc,
      () => {
        if (data.snapshot) Y.applyUpdate(this.doc, fromB64(data.snapshot), REMOTE);
        for (const u of data.updates) Y.applyUpdate(this.doc, fromB64(u.u), REMOTE);
      },
      REMOTE,
    );
    this.lastSeq = Math.max(this.lastSeq, data.headSeq);

    // Everything we sent was accepted or already present.
    const ackIds = new Set(sending);
    this.outbox = this.outbox.filter((e) => !ackIds.has(e.id));
    if (this.opts.persistence) void idb.outboxDelete(this.docId, sending);

    if (wantSV && data.stateVector) {
      this.handshakeDone = true;
      const missing = Y.encodeStateAsUpdate(this.doc, fromB64(data.stateVector));
      const decoded = Y.decodeUpdate(missing);
      if (decoded.structs.length > 0) {
        // Server lacks some of our content (e.g. a lost outbox write): queue it.
        this.onUpdate(missing, "repair");
      }
    }
    this.scheduleStateSave();
    this.emit({
      ready: true,
      lastError: null,
      lastSyncedAt: Date.now(),
      serverOffsetMs: data.serverTime - (started + rtt / 2),
      others: data.presence,
    });
  }
}
