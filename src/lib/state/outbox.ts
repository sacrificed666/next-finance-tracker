import type { StateChanges } from "./changes";

const DB_NAME = "finance-tracker";
const STORE = "outbox";
const KEY = "pending";

export interface Outbox {
  account: string;
  changes: StateChanges;
  at: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result ?? null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function writeOutbox(entry: Outbox): Promise<void> {
  await run("readwrite", (store) => store.put(entry, KEY));
}

export async function readOutbox(): Promise<Outbox | null> {
  const found = await run<Outbox | undefined>("readonly", (store) => store.get(KEY));
  return found && typeof found.account === "string" && found.changes ? found : null;
}

export async function clearOutbox(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY));
}
