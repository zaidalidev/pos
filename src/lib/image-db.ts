/**
 * Product photos live in IndexedDB, not localStorage.
 * localStorage is capped around 5MB; a catalogue of photos blows that quota.
 */

const DB_NAME = "shopflow-images";
const STORE = "byShop";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open image database"));
  });
}

export async function readShopImages(shopId: string): Promise<Record<string, string>> {
  if (typeof indexedDB === "undefined") return {};
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(shopId);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value && typeof value === "object" ? (value as Record<string, string>) : {});
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function writeShopImages(shopId: string, images: Record<string, string>): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(images, shopId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save images"));
    });
  } catch (err) {
    console.warn("[shopflow] image save failed", err);
  }
}

export async function deleteShopImages(shopId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(shopId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
