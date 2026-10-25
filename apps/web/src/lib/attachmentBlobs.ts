/**
 * Attachment bytes for the browser-only store.
 *
 * The local store used to keep screenshots as base64 data URLs inside the same
 * localStorage record as the trades. That has two problems: localStorage caps
 * the whole origin at about 5 MB, and base64 adds a third again on top of the
 * file size. One chart screenshot could therefore make every subsequent save
 * fail.
 *
 * IndexedDB stores Blobs natively, without the base64 overhead, and browsers
 * allow it hundreds of megabytes. Only the bytes live here; the attachment
 * metadata stays in localStorage with the rest of the database, so the two are
 * still written, read and erased together.
 */

const DB_NAME = "tradevault-attachments";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

/** The `remote_path` prefix that marks a blob held in this browser. */
export const LOCAL_BLOB_PREFIX = "indexeddb:";

export function localBlobPath(id: string): string {
  return `${LOCAL_BLOB_PREFIX}${id}`;
}

/** The attachment id inside a `localBlobPath`, or null for anything else. */
export function localBlobId(path: string): string | null {
  return path.startsWith(LOCAL_BLOB_PREFIX) ? path.slice(LOCAL_BLOB_PREFIX.length) : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser does not support IndexedDB"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

/**
 * Run one request in its own transaction and hand back the result.
 *
 * The connection is closed when the transaction settles rather than left open:
 * a browser only counts storage against the origin once the transaction
 * commits, and an idle connection would keep the database blocked for a later
 * version upgrade.
 */
function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let settled = false;
        const close = () => db.close();

        const tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));

        request.onsuccess = () => {
          settled = true;
          resolve(request.result);
        };
        request.onerror = () => {
          settled = true;
          reject(request.error ?? new Error("IndexedDB request failed"));
        };
        tx.oncomplete = close;
        tx.onerror = () => {
          close();
          if (!settled) reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
        tx.onabort = () => {
          close();
          if (!settled) reject(tx.error ?? new Error("IndexedDB transaction was aborted"));
        };
      })
  );
}

export async function putAttachmentBlob(id: string, blob: Blob): Promise<void> {
  await runTransaction("readwrite", (store) => store.put(blob, id));
}

export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const blob = await runTransaction<Blob | undefined>("readonly", (store) => store.get(id));
  return blob ?? null;
}

export async function deleteAttachmentBlob(id: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(id));
}

export async function clearAttachmentBlobs(): Promise<void> {
  await runTransaction("readwrite", (store) => store.clear());
}
