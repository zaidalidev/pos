/**
 * Lean local persistence for shoponclick.
 * - Session and shop list stay in their own keys
 * - Each shop bag is stored as catalogue / sales / ledger slices
 * - Product photos go to IndexedDB, never into these keys
 * - A sale rewrites only the slices that changed
 */

import {
  BAG_SLICES,
  joinBag,
  splitBag,
  unionSaveScope,
  type BagSlice,
  type SaveScope,
  type ShopCounts,
  type SyncSlice,
} from "./bag-slices";
import { deleteShopImages, writeShopImages } from "./image-db";
import type { PlatformFee, Product, Shop, User } from "./mock-data";

export type { SaveScope };

const LEGACY_V2 = "shopflow-auth-v2";
const LEGACY_V1 = "shopflow-auth-v1";
const SESSION_KEY = "shopflow-session-v3";
const META_KEY = "shopflow-meta-v3";
const BAG_PREFIX = "shopflow-bag-v3:";
const INDEX_KEY = "shopflow-bags-index-v3";

/** Retention caps — keep operational history, drop noisy ephemeral growth. */
export const RETENTION = {
  notifications: 80,
  held: 25,
  accountBalanceLogs: 250,
  platformFees: 48,
  /** Max data-URL length kept for a product image (~150KB). Larger are dropped on save. */
  maxImageChars: 150_000,
} as const;

const SAVE_DEBOUNCE_MS = 400;

/** Structural bag shape — avoids circular import with store.ts */
export type PersistBag = {
  products: Product[];
  notifications: unknown[];
  held: unknown[];
  accountBalanceLogs: unknown[];
  [key: string]: unknown;
};

export type PersistSession = {
  sessionUserId: string | null;
  viewingShopId: string | null;
};

export type PersistMeta = {
  shops: Shop[];
  allUsers: User[];
  platformFees: PlatformFee[];
  /** Counts for shops whose full bag is not loaded (admin list). */
  shopCounts?: Record<string, ShopCounts>;
};

export type PersistRoot = PersistSession & PersistMeta & {
  bags: Record<string, PersistBag>;
  currentUser: string;
};

type LegacyV2 = PersistMeta & PersistSession & {
  bags?: Record<string, PersistBag>;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: PersistRoot | null = null;
let pendingScope: SaveScope | undefined;
let pendingScopeSet = false;
let lastSessionJson = "";
let lastMetaJson = "";
/** `${shopId}:${slice}` → last JSON written. */
let lastSliceJson = new Map<string, string>();
let unloadBound = false;

function sliceStorageKey(shopId: string, slice: BagSlice) {
  return `${BAG_PREFIX}${shopId}:${slice}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function trimList<T>(list: T[] | undefined, max: number): T[] {
  if (!list?.length) return [];
  return list.length <= max ? list : list.slice(0, max);
}

/** Drop oversized base64 images so one photo cannot blow the quota. */
function slimProducts(products: Product[] | undefined): Product[] {
  if (!products?.length) return [];
  let changed = false;
  const next = products.map((p) => {
    if (!p.image || p.image.length <= RETENTION.maxImageChars) return p;
    changed = true;
    return { ...p, image: "" };
  });
  return changed ? next : products;
}

export function pruneBag<T extends PersistBag>(bag: T): T {
  return {
    ...bag,
    products: slimProducts(bag.products as Product[]),
    notifications: trimList(bag.notifications as unknown[], RETENTION.notifications),
    held: trimList(bag.held as unknown[], RETENTION.held),
    accountBalanceLogs: trimList(bag.accountBalanceLogs as unknown[], RETENTION.accountBalanceLogs),
  };
}

export function pruneRoot(r: PersistRoot): PersistRoot {
  const bags: Record<string, PersistBag> = {};
  for (const [id, bag] of Object.entries(r.bags)) {
    bags[id] = pruneBag(bag);
  }
  return {
    ...r,
    bags,
    platformFees: trimList(r.platformFees, RETENTION.platformFees),
  };
}

function bagKey(shopId: string) {
  return `${BAG_PREFIX}${shopId}`;
}

/** Slice keys win. Photos still sitting on the old single key are copied across until IndexedDB has them. */
function readStoredBag(shopId: string): PersistBag | null {
  const parts: Partial<Record<BagSlice, PersistBag>> = {};
  let foundSlice = false;
  for (const slice of BAG_SLICES) {
    const parsed = safeParse<PersistBag>(localStorage.getItem(sliceStorageKey(shopId, slice)));
    if (!parsed) continue;
    parts[slice] = parsed;
    foundSlice = true;
  }
  const legacy = safeParse<PersistBag>(localStorage.getItem(bagKey(shopId)));
  if (!foundSlice) return legacy;
  const bag = joinBag(parts) as PersistBag;
  const legacyProducts = legacy?.products;
  if (!Array.isArray(bag.products) || !Array.isArray(legacyProducts)) return bag;
  const images = new Map<string, string>();
  for (const product of legacyProducts) {
    if (product?.image) images.set(product.id, product.image);
  }
  if (!images.size) return bag;
  bag.products = bag.products.map((product) => {
    const image = images.get(product.id);
    return !product.image && image ? { ...product, image } : product;
  });
  return bag;
}

function deleteShopStorage(shopId: string) {
  localStorage.removeItem(bagKey(shopId));
  for (const slice of BAG_SLICES) {
    localStorage.removeItem(sliceStorageKey(shopId, slice));
    lastSliceJson.delete(`${shopId}:${slice}`);
  }
  void deleteShopImages(shopId);
}

function readSplit(): PersistRoot | null {
  if (typeof window === "undefined") return null;
  const session = safeParse<PersistSession>(localStorage.getItem(SESSION_KEY));
  const meta = safeParse<PersistMeta>(localStorage.getItem(META_KEY));
  if (!session || !meta) return null;

  const ids = safeParse<string[]>(localStorage.getItem(INDEX_KEY)) ?? meta.shops.map((s) => s.id);
  const bags: Record<string, PersistBag> = {};
  const loadId = (id: string) => {
    if (bags[id]) return;
    const bag = readStoredBag(id);
    if (bag) bags[id] = pruneBag(bag);
  };
  for (const id of ids) loadId(id);
  for (const shop of meta.shops) loadId(shop.id);

  const user = meta.allUsers.find((u) => u.id === session.sessionUserId);
  return {
    ...session,
    ...meta,
    platformFees: trimList(meta.platformFees ?? [], RETENTION.platformFees),
    bags,
    currentUser: user?.name ?? "Guest",
  };
}

function migrateLegacyV2(): PersistRoot | null {
  if (typeof window === "undefined") return null;
  const data = safeParse<LegacyV2>(localStorage.getItem(LEGACY_V2));
  if (!data?.shops || !data.allUsers) return null;
  const bags: Record<string, PersistBag> = {};
  for (const [id, bag] of Object.entries(data.bags ?? {})) {
    bags[id] = pruneBag(bag);
  }
  const user = data.allUsers.find((u) => u.id === data.sessionUserId);
  const root: PersistRoot = {
    shops: data.shops,
    allUsers: data.allUsers,
    platformFees: trimList(data.platformFees ?? [], RETENTION.platformFees),
    sessionUserId: data.sessionUserId ?? null,
    viewingShopId: data.viewingShopId ?? null,
    bags,
    currentUser: user?.name ?? "Guest",
  };
  writeSplitNow(root);
  try {
    localStorage.removeItem(LEGACY_V2);
  } catch {
    /* ignore */
  }
  return root;
}

export function loadPersistedRoot(): PersistRoot | null {
  if (typeof window === "undefined") return null;
  const split = readSplit();
  if (split) return split;
  return migrateLegacyV2();
}

/** True when only the legacy v1 key exists (store handles that migration). */
export function hasLegacyV1(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(SESSION_KEY) && !localStorage.getItem(LEGACY_V2) && !!localStorage.getItem(LEGACY_V1);
}

function writeKey(key: string, json: string, cache: { get: () => string; set: (v: string) => void }) {
  if (cache.get() === json) return;
  localStorage.setItem(key, json);
  cache.set(json);
}

function writeBagSlices(shopId: string, bag: PersistBag, slices: SyncSlice[] | undefined) {
  const pruned = pruneBag(bag);
  const { slices: parts, images } = splitBag(pruned);
  const wanted = slices ?? [...BAG_SLICES, "images" as const];
  for (const slice of BAG_SLICES) {
    if (!wanted.includes(slice)) continue;
    const json = JSON.stringify(parts[slice]);
    const cacheKey = `${shopId}:${slice}`;
    if (lastSliceJson.get(cacheKey) === json) continue;
    localStorage.setItem(sliceStorageKey(shopId, slice), json);
    lastSliceJson.set(cacheKey, json);
  }
  if (wanted.includes("images")) {
    void writeShopImages(shopId, images).finally(() => {
      try {
        localStorage.removeItem(bagKey(shopId));
      } catch {
        /* ignore */
      }
    });
  }
}

function writeSplitNow(raw: PersistRoot, scope?: SaveScope, attempt = 0) {
  if (typeof window === "undefined") return;
  const r = pruneRoot(raw);
  try {
    const session: PersistSession = {
      sessionUserId: r.sessionUserId,
      viewingShopId: r.viewingShopId,
    };
    const meta: PersistMeta = {
      shops: r.shops,
      allUsers: r.allUsers,
      platformFees: r.platformFees,
      shopCounts: r.shopCounts ?? {},
    };
    writeKey(SESSION_KEY, JSON.stringify(session), {
      get: () => lastSessionJson,
      set: (v) => { lastSessionJson = v; },
    });
    writeKey(META_KEY, JSON.stringify(meta), {
      get: () => lastMetaJson,
      set: (v) => { lastMetaJson = v; },
    });

    if (scope?.slices && scope.slices.length === 0) return;

    const ids = Object.keys(r.bags);
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    const shopIds = scope?.shopId ? [scope.shopId] : ids;
    for (const id of shopIds) {
      const bag = r.bags[id];
      if (!bag) continue;
      writeBagSlices(id, bag, scope?.slices);
    }
    if (!scope?.shopId) {
      const keep = new Set(ids);
      for (const cacheKey of [...lastSliceJson.keys()]) {
        const shopId = cacheKey.slice(0, cacheKey.lastIndexOf(":"));
        if (keep.has(shopId)) continue;
        deleteShopStorage(shopId);
      }
    }
  } catch (err) {
    if (attempt > 0) return;
    console.warn("[shopflow] persist failed, retrying with shorter lists", err);
    try {
      const stripped: PersistRoot = {
        ...r,
        bags: Object.fromEntries(
          Object.entries(r.bags).map(([id, bag]) => [
            id,
            {
              ...bag,
              products: (bag.products as Product[]).map((p) => (p.image ? { ...p, image: "" } : p)),
              notifications: (bag.notifications as unknown[]).slice(0, 20),
              held: (bag.held as unknown[]).slice(0, 5),
            },
          ]),
        ),
      };
      lastSessionJson = "";
      lastMetaJson = "";
      lastSliceJson.clear();
      writeSplitNow(stripped, scope, attempt + 1);
    } catch {
      /* give up — memory state still works */
    }
  }
}

function bindUnload() {
  if (unloadBound || typeof window === "undefined") return;
  unloadBound = true;
  const flush = () => flushPersist();
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Schedule a debounced write. Rapid POS updates coalesce into one disk write. */
function rememberScope(scope: SaveScope | undefined) {
  if (!pendingScopeSet) {
    pendingScope = scope;
    pendingScopeSet = true;
    return;
  }
  // A missing slice list means "write every slice" and must not be narrowed by a later meta-only save.
  if (pendingScope?.slices === undefined || scope?.slices === undefined) {
    pendingScope = {};
    return;
  }
  pendingScope = unionSaveScope(pendingScope, scope);
}

export function schedulePersist(root: PersistRoot, scope?: SaveScope) {
  rememberScope(scope);
  pending = root;
  const imageBag = scope?.shopId ? root.bags[scope.shopId] : undefined;
  if (scope?.slices?.includes("images") && scope.shopId && imageBag) {
    const { images } = splitBag(pruneBag(imageBag));
    void writeShopImages(scope.shopId, images);
  }
  bindUnload();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!pending) {
      pendingScope = undefined;
      pendingScopeSet = false;
      return;
    }
    const nextScope = pendingScope;
    writeSplitNow(pending, nextScope);
    pending = null;
    pendingScope = undefined;
    pendingScopeSet = false;
  }, SAVE_DEBOUNCE_MS);
}

/** Force any pending write to disk immediately. */
export function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pending) return;
  const nextScope = pendingScope;
  writeSplitNow(pending, nextScope);
  pending = null;
  pendingScope = undefined;
  pendingScopeSet = false;
}

/** Approximate persisted size in bytes (for diagnostics). */
export function estimatePersistBytes(): number {
  if (typeof window === "undefined") return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("shopflow-")) continue;
    total += (localStorage.getItem(key)?.length ?? 0) * 2; // UTF-16
  }
  return total;
}
