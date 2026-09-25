/**
 * Minimal IndexedDB storage for offline recovery:
 *   docs:   docId → { state (merged Yjs state), lastSeq, savedAt }
 *   outbox: [docId, id] → { update, createdAt }  (local changes not yet acknowledged)
 * All calls degrade gracefully when IndexedDB is unavailable (private mode):
 * callers learn that local persistence is off and report it to the user.
 */

const DB_NAME = "clash-sync";
const VERSION = 1;

export interface StoredDoc {
  docId: string;
  state: Uint8Array;
  lastSeq: number;
  savedAt: number;
}

export interface OutboxEntry {
  docId: string;
  id: number;
  update: Uint8Array;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const open = indexedDB.open(DB_NAME, VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "docId" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: ["docId", "id"] });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetDbForTests() {
  dbPromise = null;
}

export async function loadDoc(docId: string): Promise<StoredDoc | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return ((await req(db.transaction("docs").objectStore("docs").get(docId))) as StoredDoc | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveDoc(d: StoredDoc): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction("docs", "readwrite");
    tx.objectStore("docs").put(d);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function outboxAll(docId: string): Promise<OutboxEntry[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const range = IDBKeyRange.bound([docId, 0], [docId, Number.MAX_SAFE_INTEGER]);
    return (await req(db.transaction("outbox").objectStore("outbox").getAll(range))) as OutboxEntry[];
  } catch {
    return [];
  }
}

export async function outboxAdd(e: OutboxEntry): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put(e);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function outboxDelete(docId: string, ids: number[]): Promise<void> {
  const db = await openDb();
  if (!db || ids.length === 0) return;
  try {
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    for (const id of ids) store.delete([docId, id]);
    await new Promise<void>((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
      tx.onabort = () => res();
    });
  } catch {
    /* ignore */
  }
}

/** Ask the browser not to evict our storage under pressure (best effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

/** Number of local changes not yet acknowledged by the server, across all documents. */
export async function outboxCount(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  try {
    return await req(db.transaction("outbox", "readonly").objectStore("outbox").count());
  } catch {
    return 0;
  }
}

/** Delete everything stored on this device (sign-out on a shared computer). */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  db?.close();
  dbPromise = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
