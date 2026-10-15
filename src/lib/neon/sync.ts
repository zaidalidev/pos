import {
  bagCounts,
  joinBag,
  sliceHasBody,
  splitBag,
  type BagParts,
  BAG_SLICES,
  unionSaveScope,
  type SaveScope,
  type ShopCounts,
  type ShopImages,
  type SyncSlice,
} from "../bag-slices";
import type { PlatformFee, Shop, User } from "../mock-data";
import type { PersistBag, PersistRoot } from "../persist";
import { pruneBag, pruneRoot } from "../persist";
import { isNeonDataConfigured, neon } from "./auth";
import { getNeonSession } from "./session";

export type { SaveScope };

type ShopRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  status: Shop["status"];
  plan: Shop["plan"];
  monthly_fee: number | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  auth_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: User["role"];
  status: User["status"];
  shop_id: string | null;
  is_platform_admin: boolean;
  last_login: string | null;
};

type FeeRow = {
  id: string;
  shop_id: string;
  month: string;
  amount: number;
  status: PlatformFee["status"];
  paid_at: string | null;
  note: string | null;
};

type BagRow = {
  shop_id: string;
  data?: PersistBag;
  catalogue?: PersistBag;
  sales?: PersistBag;
  ledger?: PersistBag;
  images?: ShopImages;
  product_count?: number | null;
  sale_count?: number | null;
  customer_count?: number | null;
  updated_at?: string;
};

const SLICE_COLUMNS =
  "shop_id, data, catalogue, sales, ledger, images, product_count, sale_count, customer_count";
const COUNT_COLUMNS = "shop_id, product_count, sale_count, customer_count";
const LEGACY_COLUMNS = "shop_id, data";

/** Live databases created before slice columns still have a single `data` blob. */
let bagShape: "unknown" | "slices" | "legacy" = "unknown";
let warnedLegacyShape = false;

function shopToRow(s: Shop): ShopRow {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    city: s.city,
    status: s.status,
    plan: s.plan,
    monthly_fee: typeof s.monthlyFee === "number" ? s.monthlyFee : null,
    created_at: s.createdAt || new Date().toISOString(),
  };
}

function rowToShop(r: ShopRow): Shop {
  const shop: Shop = {
    id: r.id,
    name: r.name,
    phone: r.phone ?? "",
    email: r.email ?? "",
    city: r.city ?? "",
    status: r.status,
    plan: r.plan,
    createdAt: r.created_at,
  };
  if (typeof r.monthly_fee === "number") shop.monthlyFee = r.monthly_fee;
  return shop;
}

function userToRow(u: User): ProfileRow {
  return {
    id: u.id,
    auth_id: u.authId ?? null,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "",
    role: u.role,
    status: u.status,
    shop_id: u.shopId,
    is_platform_admin: !!u.isPlatformAdmin,
    last_login: u.lastLogin || null,
  };
}

function rowToUser(r: ProfileRow): User {
  const user: User = {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? "",
    role: r.role,
    status: r.status,
    password: "",
    lastLogin: r.last_login ?? "",
    shopId: r.shop_id,
    isPlatformAdmin: !!r.is_platform_admin,
  };
  if (r.auth_id) user.authId = r.auth_id;
  return user;
}

function feeToRow(f: PlatformFee): FeeRow {
  return {
    id: f.id,
    shop_id: f.shopId,
    month: f.month,
    amount: f.amount,
    status: f.status,
    paid_at: f.paidAt ?? null,
    note: f.note ?? null,
  };
}

function rowToFee(r: FeeRow): PlatformFee {
  const fee: PlatformFee = {
    id: r.id,
    shopId: r.shop_id,
    month: r.month,
    amount: r.amount,
    status: r.status,
  };
  if (r.paid_at) fee.paidAt = r.paid_at;
  if (r.note) fee.note = r.note;
  return fee;
}

function errMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message?: string }).message;
    if (m) return m;
  }
  return fallback;
}

function isMissingSliceColumn(error: unknown): boolean {
  const msg = errMessage(error, "");
  return /catalogue|schema cache|column|PGRST204/i.test(msg);
}

function countsFromRow(row: BagRow): ShopCounts {
  return {
    products: row.product_count ?? 0,
    sales: row.sale_count ?? 0,
    customers: row.customer_count ?? 0,
  };
}

function bagFromRow(row: BagRow): PersistBag {
  const useSlices =
    sliceHasBody(row.catalogue) ||
    sliceHasBody(row.sales) ||
    sliceHasBody(row.ledger) ||
    sliceHasBody(row.images);
  if (useSlices) {
    const parts: Partial<BagParts> = {};
    if (row.catalogue) parts.catalogue = row.catalogue;
    if (row.sales) parts.sales = row.sales;
    if (row.ledger) parts.ledger = row.ledger;
    return joinBag(parts, row.images) as PersistBag;
  }
  return (row.data ?? {}) as PersistBag;
}

async function selectBagRows(columns: string, shopId?: string) {
  let query = neon.from("shop_bags").select(columns);
  if (shopId) query = query.eq("shop_id", shopId);
  return query;
}

async function loadBagRows(shopId: string | undefined, columns: string): Promise<{ rows: BagRow[] }> {
  const columnsToUse =
    bagShape === "legacy" ? (columns === COUNT_COLUMNS ? "shop_id" : LEGACY_COLUMNS) : columns;
  const res = await selectBagRows(columnsToUse, shopId);
  if (res.error && bagShape !== "legacy" && isMissingSliceColumn(res.error)) {
    bagShape = "legacy";
    if (!warnedLegacyShape) {
      warnedLegacyShape = true;
      console.warn("[neon-sync] shop_bags has no slice columns yet. Run the new statements in db/schema.sql.");
    }
    return loadBagRows(shopId, columns);
  }
  if (res.error) throw new Error(errMessage(res.error, "Failed to load shop data from Neon."));
  if (bagShape === "unknown") bagShape = "slices";
  return { rows: (res.data ?? []) as unknown as BagRow[] };
}

/** Load shops / profiles / fees, plus one shop bag — or counts only for a platform admin. */
export async function pullRootFromNeon(): Promise<PersistRoot | null> {
  if (!isNeonDataConfigured()) return null;

  const [shopsRes, profilesRes, feesRes] = await Promise.all([
    neon.from("shops").select("*"),
    neon.from("profiles").select("*"),
    neon.from("platform_fees").select("*"),
  ]);

  if (shopsRes.error) {
    console.warn("[neon-sync] shops pull failed:", shopsRes.error);
    throw new Error(errMessage(shopsRes.error, "Failed to load shops from Neon."));
  }
  if (profilesRes.error) {
    console.warn("[neon-sync] profiles pull failed:", profilesRes.error);
    throw new Error(errMessage(profilesRes.error, "Failed to load profiles from Neon."));
  }
  // Fees may 403 for non-admins depending on PostgREST; treat as empty.
  if (feesRes.error) {
    console.warn("[neon-sync] platform_fees pull skipped:", feesRes.error);
  }

  const shops = ((shopsRes.data ?? []) as ShopRow[]).map(rowToShop);
  const allUsers = ((profilesRes.data ?? []) as ProfileRow[]).map(rowToUser);
  const platformFees = feesRes.error
    ? []
    : ((feesRes.data ?? []) as FeeRow[]).map(rowToFee);

  const session = await getNeonSession();
  const me = session?.user
    ? allUsers.find((user) => user.authId === session.user.id)
      ?? allUsers.find((user) => user.email.toLowerCase() === session.user.email.trim().toLowerCase())
    : undefined;
  const admin = !!me?.isPlatformAdmin;
  const shopId = admin ? undefined : me?.shopId ?? undefined;

  const bags: Record<string, PersistBag> = {};
  const shopCounts: Record<string, ShopCounts> = {};
  try {
    if (admin) {
      const { rows } = await loadBagRows(undefined, COUNT_COLUMNS);
      for (const row of rows) {
        if (!row?.shop_id) continue;
        shopCounts[row.shop_id] = countsFromRow(row);
        if (bagShape === "legacy" && row.data) bags[row.shop_id] = pruneBag(bagFromRow(row));
      }
    } else if (shopId) {
      const { rows } = await loadBagRows(shopId, SLICE_COLUMNS);
      for (const row of rows) {
        if (!row?.shop_id) continue;
        bags[row.shop_id] = pruneBag(bagFromRow(row));
        shopCounts[row.shop_id] = bagCounts(bags[row.shop_id]);
      }
    }
  } catch (err) {
    console.warn("[neon-sync] shop_bags pull failed:", err);
    throw err instanceof Error ? err : new Error("Failed to load shop data from Neon.");
  }

  return {
    shops,
    allUsers,
    platformFees,
    shopCounts,
    bags,
    sessionUserId: null,
    viewingShopId: null,
    currentUser: "Guest",
  };
}

/** Full bag for one shop. Used when a platform admin enters that shop. */
export async function pullShopBag(shopId: string): Promise<PersistBag | null> {
  if (!isNeonDataConfigured()) return null;
  const { rows } = await loadBagRows(shopId, SLICE_COLUMNS);
  const row = rows.find((item) => item.shop_id === shopId) ?? rows[0];
  if (!row) return null;
  return pruneBag(bagFromRow(row));
}

export function neonRootHasData(root: PersistRoot | null | undefined): boolean {
  if (!root) return false;
  return root.shops.length > 0 || root.allUsers.length > 0;
}

/** Lists that mean the shop actually has data. Default accounts alone do not count. */
const SHOP_RECORD_KEYS = [
  "products",
  "categories",
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "expenses",
  "staff",
  "staffTxns",
  "adjustments",
  "saleReturns",
  "purchaseReturns",
] as const;

function shopRecordCount(bag: PersistBag | undefined): number {
  if (!bag) return 0;
  let count = 0;
  for (const key of SHOP_RECORD_KEYS) {
    const list = bag[key];
    if (Array.isArray(list)) count += list.length;
  }
  return count;
}

function unionProducts(primary: unknown, extra: unknown): unknown[] {
  const remote = Array.isArray(primary) ? primary : [];
  const local = Array.isArray(extra) ? extra : [];
  const localById = new Map<string, { image?: string }>();
  for (const item of local) {
    if (item && typeof item === "object" && "id" in item && (item as { id?: unknown }).id != null && (item as { id?: unknown }).id !== "") {
      localById.set(String((item as { id: unknown }).id), item as { image?: string });
    }
  }
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of remote) {
    if (!item || typeof item !== "object" || !("id" in item) || (item as { id?: unknown }).id == null || (item as { id?: unknown }).id === "") {
      out.push(item);
      continue;
    }
    const id = String((item as { id: unknown }).id);
    if (seen.has(id)) continue;
    seen.add(id);
    const localImage = localById.get(id)?.image;
    const remoteImage = (item as { image?: string }).image;
    out.push(!remoteImage && localImage ? { ...(item as object), image: localImage } : item);
  }
  for (const item of local) {
    if (!item || typeof item !== "object" || !("id" in item) || (item as { id?: unknown }).id == null || (item as { id?: unknown }).id === "") continue;
    const id = String((item as { id: unknown }).id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function unionById(primary: unknown, extra: unknown): unknown[] {
  const first = Array.isArray(primary) ? primary : [];
  const second = Array.isArray(extra) ? extra : [];
  const seen = new Set<string>();
  const out: unknown[] = [];
  const push = (item: unknown, keepWithoutId: boolean) => {
    if (item && typeof item === "object" && "id" in item && (item as { id?: unknown }).id != null && (item as { id?: unknown }).id !== "") {
      const id = String((item as { id: unknown }).id);
      if (seen.has(id)) return;
      seen.add(id);
      out.push(item);
      return;
    }
    if (keepWithoutId) out.push(item);
  };
  for (const item of first) push(item, true);
  for (const item of second) push(item, false);
  return out;
}

/**
 * Keep browser records when Neon has an empty or older bag.
 * Same id prefers Neon; rows that exist only locally are kept.
 */
export function mergeBagWithLocal(remote: PersistBag | undefined, local: PersistBag | undefined): PersistBag | undefined {
  if (!remote && !local) return undefined;
  if (!remote) return local;
  if (!local) return remote;
  const remoteCount = shopRecordCount(remote);
  const localCount = shopRecordCount(local);
  if (remoteCount === 0 && localCount > 0) return local;
  if (localCount === 0) return remote;

  const merged: PersistBag = { ...remote };
  const write = merged as Record<string, unknown>;
  for (const key of SHOP_RECORD_KEYS) {
    write[key] = key === "products"
      ? unionProducts(remote[key], local[key])
      : unionById(remote[key], local[key]);
  }
  for (const key of ["accounts", "accountBalanceLogs", "notifications", "held"] as const) {
    if (remote[key] || local[key]) write[key] = unionById(remote[key], local[key]);
  }
  const nextInvoice = Math.max(Number(remote["nextInvoice"]) || 0, Number(local["nextInvoice"]) || 0);
  const nextPurchase = Math.max(Number(remote["nextPurchase"]) || 0, Number(local["nextPurchase"]) || 0);
  if (nextInvoice) write["nextInvoice"] = nextInvoice;
  if (nextPurchase) write["nextPurchase"] = nextPurchase;
  return merged;
}

/** Merge Neon bags with the local cache for shops this login can see. */
export function mergePulledBags(
  remoteBags: Record<string, PersistBag>,
  localBags: Record<string, PersistBag>,
  shopIds: string[],
): { bags: Record<string, PersistBag>; keptLocalRecords: boolean } {
  const bags: Record<string, PersistBag> = {};
  let keptLocalRecords = false;
  const ids = new Set([...shopIds, ...Object.keys(remoteBags)]);
  for (const id of ids) {
    const remote = remoteBags[id];
    const local = localBags[id];
    const merged = mergeBagWithLocal(remote, local);
    if (!merged) continue;
    bags[id] = merged;
    if (shopRecordCount(merged) > shopRecordCount(remote)) keptLocalRecords = true;
  }
  return { bags, keptLocalRecords };
}

type SyncResult = { ok: true } | { ok: false; error: string };

const lastPushedSlice = new Map<string, string>();

function buildBagUpsert(shopId: string, bag: PersistBag, wanted: SyncSlice[]): { row: Record<string, unknown>; marks: [string, string][] } | null {
  const pruned = pruneBag(bag);
  if (shopRecordCount(pruned) === 0) return null;
  const { slices, images } = splitBag(pruned);
  const marks: [string, string][] = [];

  if (bagShape === "legacy") {
    const data = joinBag(slices);
    const json = JSON.stringify(data);
    const key = `${shopId}:legacy`;
    if (lastPushedSlice.get(key) === json) return null;
    return { row: { shop_id: shopId, data }, marks: [[key, json]] };
  }

  const row: Record<string, unknown> = { shop_id: shopId };
  let changed = false;
  for (const slice of BAG_SLICES) {
    if (!wanted.includes(slice)) continue;
    const json = JSON.stringify(slices[slice]);
    const key = `${shopId}:${slice}`;
    if (lastPushedSlice.get(key) === json) continue;
    row[slice] = slices[slice];
    marks.push([key, json]);
    changed = true;
  }
  if (wanted.includes("images")) {
    const json = JSON.stringify(images);
    const key = `${shopId}:images`;
    if (lastPushedSlice.get(key) !== json) {
      row["images"] = images;
      marks.push([key, json]);
      changed = true;
    }
  }
  if (!changed) return null;
  const counts = bagCounts(pruned);
  row["product_count"] = counts.products;
  row["sale_count"] = counts.sales;
  row["customer_count"] = counts.customers;
  return { row, marks };
}

/** Upsert shops, profiles, and only the bag slices that changed. */
export async function pushRootToNeon(raw: PersistRoot, scope?: SaveScope, attempt = 0): Promise<SyncResult> {
  if (!isNeonDataConfigured()) {
    return { ok: false, error: "Neon Data API is not configured." };
  }

  const root = pruneRoot(raw);
  const shopRows = root.shops.map(shopToRow);
  const profileRows = root.allUsers.map(userToRow);
  const feeRows = root.platformFees.map(feeToRow);

  // Shops first (bags / fees FK)
  if (shopRows.length) {
    const { error } = await neon.from("shops").upsert(shopRows, { onConflict: "id" });
    if (error) return { ok: false, error: errMessage(error, "Failed to sync shops.") };
  }

  if (profileRows.length) {
    const { error } = await neon.from("profiles").upsert(profileRows, { onConflict: "id" });
    if (error) return { ok: false, error: errMessage(error, "Failed to sync profiles.") };
  }

  if (feeRows.length) {
    const { error } = await neon.from("platform_fees").upsert(feeRows, { onConflict: "id" });
    if (error) {
      // Non-admins cannot write fees — ignore permission errors.
      const msg = errMessage(error, "");
      if (!/permission|policy|rls|403|42501/i.test(msg)) {
        return { ok: false, error: errMessage(error, "Failed to sync platform fees.") };
      }
    }
  }

  if (scope?.slices && scope.slices.length === 0) return { ok: true };

  const wanted: SyncSlice[] = scope?.slices ?? [...BAG_SLICES, "images"];
  const shopIds = scope?.shopId ? [scope.shopId] : Object.keys(root.bags);
  const rows: Record<string, unknown>[] = [];
  const marks: [string, string][] = [];
  for (const shopId of shopIds) {
    const bag = root.bags[shopId];
    if (!bag) continue;
    const built = buildBagUpsert(shopId, bag, wanted);
    if (!built) continue;
    rows.push(built.row);
    marks.push(...built.marks);
  }

  // Upsert-only: never delete Neon rows missing from this client, and never overwrite with an empty bag.
  if (rows.length) {
    const { error } = await neon.from("shop_bags").upsert(rows, { onConflict: "shop_id" });
    if (error && attempt === 0 && bagShape !== "legacy" && isMissingSliceColumn(error)) {
      bagShape = "legacy";
      if (!warnedLegacyShape) {
        warnedLegacyShape = true;
        console.warn("[neon-sync] shop_bags has no slice columns yet. Run the new statements in db/schema.sql.");
      }
      return pushRootToNeon(raw, scope, attempt + 1);
    }
    if (error) return { ok: false, error: errMessage(error, "Failed to sync shop data.") };
    for (const [key, json] of marks) lastPushedSlice.set(key, json);
  }

  return { ok: true };
}

const NEON_DEBOUNCE_MS = 700;
let neonTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRoot: PersistRoot | null = null;
let pendingScope: SaveScope | undefined;
let pendingScopeSet = false;

function rememberNeonScope(scope: SaveScope | undefined) {
  if (!pendingScopeSet) {
    pendingScope = scope;
    pendingScopeSet = true;
    return;
  }
  if (pendingScope?.slices === undefined || scope?.slices === undefined) {
    pendingScope = {};
    return;
  }
  pendingScope = unionSaveScope(pendingScope, scope);
}
let drainPromise: Promise<void> | null = null;
let lastResult: SyncResult | null = null;

/** Debounced Neon push — coalesces rapid POS updates into the slices that changed. */
export function scheduleNeonSync(root: PersistRoot, scope?: SaveScope) {
  if (!isNeonDataConfigured()) return;
  rememberNeonScope(scope);
  pendingRoot = root;
  if (neonTimer) clearTimeout(neonTimer);
  neonTimer = setTimeout(() => {
    neonTimer = null;
    void flushNeonSync();
  }, NEON_DEBOUNCE_MS);
}

/** Push whatever is pending. Resolves only when the queue is idle. */
async function drainNeonSync(): Promise<void> {
  try {
    // Data API requires a JWT; skip quiet no-ops when logged out.
    const session = await getNeonSession();
    if (!session?.user) {
      pendingRoot = null;
      pendingScope = undefined;
      pendingScopeSet = false;
      return;
    }
    while (pendingRoot) {
      const next = pendingRoot;
      const scope = pendingScope;
      pendingRoot = null;
      pendingScope = undefined;
      pendingScopeSet = false;
      const result = await pushRootToNeon(next, scope);
      if (!result.ok) console.warn("[neon-sync] push failed:", result.error);
      lastResult = result;
    }
  } finally {
    drainPromise = null;
    // A save landed after the loop check; keep the same callers waiting via flushNeonSync's follow-up.
    if (pendingRoot && isNeonDataConfigured()) {
      drainPromise = drainNeonSync();
    }
  }
}

/**
 * Push the latest root and wait until that push finishes.
 * Logout must await this before sign-out, or the session dies mid-push and the bag never lands.
 */
export function flushNeonSync(): Promise<SyncResult | null> {
  if (neonTimer) {
    clearTimeout(neonTimer);
    neonTimer = null;
  }
  if (!isNeonDataConfigured()) return Promise.resolve(null);
  if (!pendingRoot && !drainPromise) return Promise.resolve(lastResult);

  if (!drainPromise) drainPromise = drainNeonSync();
  const waited = drainPromise;
  return waited.then(() => {
    if (pendingRoot || drainPromise) return flushNeonSync();
    return lastResult;
  });
}
