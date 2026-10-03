import type { PlatformFee, Shop, User } from "../mock-data";
import type { PersistBag, PersistRoot } from "../persist";
import { pruneBag, pruneRoot } from "../persist";
import { isNeonDataConfigured, neon } from "./auth";
import { getNeonSession } from "./session";

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
  data: PersistBag;
  updated_at?: string;
};

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

/** Load shops / profiles / fees / bags visible under RLS. */
export async function pullRootFromNeon(): Promise<PersistRoot | null> {
  if (!isNeonDataConfigured()) return null;

  const [shopsRes, profilesRes, feesRes, bagsRes] = await Promise.all([
    neon.from("shops").select("*"),
    neon.from("profiles").select("*"),
    neon.from("platform_fees").select("*"),
    neon.from("shop_bags").select("shop_id, data"),
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
  if (bagsRes.error) {
    console.warn("[neon-sync] shop_bags pull failed:", bagsRes.error);
    throw new Error(errMessage(bagsRes.error, "Failed to load shop data from Neon."));
  }

  const shops = ((shopsRes.data ?? []) as ShopRow[]).map(rowToShop);
  const allUsers = ((profilesRes.data ?? []) as ProfileRow[]).map(rowToUser);
  const platformFees = feesRes.error
    ? []
    : ((feesRes.data ?? []) as FeeRow[]).map(rowToFee);

  const bags: Record<string, PersistBag> = {};
  for (const row of (bagsRes.data ?? []) as BagRow[]) {
    if (!row?.shop_id) continue;
    bags[row.shop_id] = pruneBag((row.data ?? {}) as PersistBag);
  }

  return {
    shops,
    allUsers,
    platformFees,
    bags,
    sessionUserId: null,
    viewingShopId: null,
    currentUser: "Guest",
  };
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
  const remoteCount = shopRecordCount(remote);
  const localCount = shopRecordCount(local);
  if (remoteCount === 0 && localCount > 0) return local;
  if (localCount === 0 || !local) return remote;
  if (!remote) return local;

  const merged: PersistBag = { ...remote };
  const write = merged as Record<string, unknown>;
  for (const key of SHOP_RECORD_KEYS) {
    write[key] = unionById(remote[key], local[key]);
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

async function deleteMissing(
  table: "shops" | "profiles" | "platform_fees" | "shop_bags",
  idColumn: "id" | "shop_id",
  keepIds: string[],
): Promise<string | null> {
  const { data, error } = await neon.from(table).select(idColumn);
  if (error) return errMessage(error, `Failed to list ${table} for sync.`);
  const existing = (data ?? [])
    .map((row) => {
      const rec = row as unknown as Record<string, unknown>;
      const value = rec[idColumn];
      return typeof value === "string" ? value : null;
    })
    .filter((id): id is string => !!id);
  const keep = new Set(keepIds);
  const toDelete = existing.filter((id) => !keep.has(id));
  for (const id of toDelete) {
    const del = await neon.from(table).delete().eq(idColumn, id);
    if (del.error) return errMessage(del.error, `Failed to delete stale ${table} row.`);
  }
  return null;
}

/** Upsert full app root to Neon (debounced from the store). */
export async function pushRootToNeon(raw: PersistRoot): Promise<SyncResult> {
  if (!isNeonDataConfigured()) {
    return { ok: false, error: "Neon Data API is not configured." };
  }

  const root = pruneRoot(raw);
  const shopRows = root.shops.map(shopToRow);
  const profileRows = root.allUsers.map(userToRow);
  const feeRows = root.platformFees.map(feeToRow);
  const bagRows: BagRow[] = Object.entries(root.bags).map(([shopId, bag]) => ({
    shop_id: shopId,
    data: pruneBag(bag),
    updated_at: new Date().toISOString(),
  }));

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

  if (bagRows.length) {
    const { error } = await neon.from("shop_bags").upsert(bagRows, { onConflict: "shop_id" });
    if (error) return { ok: false, error: errMessage(error, "Failed to sync shop data.") };
  }

  // Remove rows deleted locally (visible set under RLS only)
  const bagErr = await deleteMissing(
    "shop_bags",
    "shop_id",
    bagRows.map((b) => b.shop_id),
  );
  if (bagErr) return { ok: false, error: bagErr };

  const feeErr = await deleteMissing(
    "platform_fees",
    "id",
    feeRows.map((f) => f.id),
  );
  if (feeErr && !/permission|policy|rls|403|42501/i.test(feeErr)) {
    return { ok: false, error: feeErr };
  }

  const profileErr = await deleteMissing(
    "profiles",
    "id",
    profileRows.map((p) => p.id),
  );
  if (profileErr) return { ok: false, error: profileErr };

  // Delete shops last (cascades bags)
  const shopErr = await deleteMissing(
    "shops",
    "id",
    shopRows.map((s) => s.id),
  );
  if (shopErr) return { ok: false, error: shopErr };

  return { ok: true };
}

const NEON_DEBOUNCE_MS = 700;
let neonTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRoot: PersistRoot | null = null;
let drainPromise: Promise<void> | null = null;
let lastResult: SyncResult | null = null;

/** Debounced Neon push — coalesces rapid POS updates. */
export function scheduleNeonSync(root: PersistRoot) {
  if (!isNeonDataConfigured()) return;
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
      return;
    }
    while (pendingRoot) {
      const next = pendingRoot;
      pendingRoot = null;
      const result = await pushRootToNeon(next);
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
