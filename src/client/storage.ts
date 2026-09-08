// Visitor-token mirror. One UUID is written to localStorage, IndexedDB and the
// Cache Storage API. Different browser "clear" actions hit different stores, so
// mirroring plus write-through-on-every-visit makes the token survive far more
// clearing paths than any single store would.

const STORAGE_KEY = "fiveo.visitor.v1"; // matches CONFIG.detection.storageKey
const IDB_NAME = "fiveo";
const IDB_STORE = "kv";
const IDB_KEY = "visitor";
const CACHE_NAME = "fiveo";
const CACHE_URL = "/__vt";

export interface DeviceTokens {
  storageToken?: string;
  idbToken?: string;
  cacheToken?: string;
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocal(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode — ignore */
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdb(): Promise<string | null> {
  const dbConn = await openIdb();
  if (!dbConn) return null;
  return new Promise((resolve) => {
    try {
      const tx = dbConn.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdb(value: string): Promise<void> {
  const dbConn = await openIdb();
  if (!dbConn) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = dbConn.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function readCache(): Promise<string | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_URL);
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

async function writeCache(value: string): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(CACHE_URL, new Response(value, { headers: { "Content-Type": "text/plain" } }));
  } catch {
    /* Cache API unavailable — ignore */
  }
}

async function writeThroughAll(value: string): Promise<void> {
  writeLocal(value);
  await Promise.all([writeIdb(value), writeCache(value)]);
}

// Read the token from whichever store still has it, repair the others via
// write-through, and return it tagged for all three signal kinds.
export async function getVisitorTokens(): Promise<DeviceTokens> {
  const local = readLocal();
  const [idb, cache] = await Promise.all([readIdb(), readCache()]);
  const token = local ?? idb ?? cache ?? crypto.randomUUID();
  await writeThroughAll(token);
  return { storageToken: token, idbToken: token, cacheToken: token };
}

// "Not you?" / override — mint a fresh token so the device is no longer linked to
// the previous guest.
export async function rotateVisitorToken(): Promise<DeviceTokens> {
  const token = crypto.randomUUID();
  await writeThroughAll(token);
  return { storageToken: token, idbToken: token, cacheToken: token };
}
