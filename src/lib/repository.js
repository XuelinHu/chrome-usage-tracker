const DB_NAME = "chromeUsageDB";
const DB_VERSION = 2;
const STORE_NAME = "usageEvents";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt", { unique: false });
      } else {
        const store = request.transaction.objectStore(STORE_NAME);
        if (!store.indexNames.contains("startedAt")) {
          store.createIndex("startedAt", "startedAt", { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listUsageEvents(startAt = Date.now() - 31 * 24 * 60 * 60 * 1000, endAt = Date.now()) {
  const db = await openDatabase();
  const events = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .index("startedAt")
      .getAll(IDBKeyRange.bound(startAt, endAt));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return events.sort((a, b) => b.startedAt - a.startedAt);
}

export async function clearUsageEvents() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
}
