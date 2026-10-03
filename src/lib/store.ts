import { useSyncExternalStore } from "react";
import * as M from "./mock-data";
import { uid } from "./format";
import {
  can,
  canAccessPath,
  defaultRolePermissions,
  firstAllowedPath,
  type PermAction,
  type PermModule,
  type RolePermissions,
} from "./permissions";
import {
  flushPersist,
  loadPersistedRoot,
  pruneBag,
  RETENTION,
  schedulePersist,
  type PersistRoot,
} from "./persist";
import {
  flushNeonSync,
  getNeonSession,
  isNeonDataConfigured,
  mergePulledBags,
  neonAdminCreateUser,
  neonAdminSetPassword,
  neonChangePassword,
  neonRootHasData,
  neonSignIn,
  neonSignOut,
  neonSignUp,
  pullRootFromNeon,
  pushRootToNeon,
  scheduleNeonSync,
} from "./neon";

const AUTH_KEY_LEGACY = "shopflow-auth-v1";

const SHOP_KEYS = [
  "products", "categories", "customers", "suppliers", "accounts", "accountBalanceLogs",
  "sales", "purchases", "expenses", "staff", "staffTxns", "adjustments", "saleReturns",
  "purchaseReturns", "notifications", "held", "settings", "nextInvoice", "nextPurchase",
  "rolePermissions",
] as const;

export type ShopBag = {
  products: M.Product[]; categories: M.Category[]; customers: M.Customer[]; suppliers: M.Supplier[];
  accounts: M.Account[]; accountBalanceLogs: M.AccountBalanceLog[]; sales: M.Sale[]; purchases: M.Purchase[];
  expenses: M.Expense[]; staff: M.Staff[];
  staffTxns: M.StaffTxn[]; adjustments: M.Adjustment[]; saleReturns: M.SaleReturn[];
  purchaseReturns: M.PurchaseReturn[]; notifications: M.AppNotification[]; held: M.HeldSale[];
  settings: M.Settings; nextInvoice: number; nextPurchase: number;
  rolePermissions: RolePermissions;
};

/** Projected shop view used by the POS app (isolated per active shop). */
export type State = ShopBag & {
  users: M.User[];
  shops: M.Shop[];
  sessionUserId: string | null;
  viewingShopId: string | null;
  currentUser: string;
  activeShopId: string | null;
};

type RootState = {
  shops: M.Shop[];
  bags: Record<string, ShopBag>;
  allUsers: M.User[];
  platformFees: M.PlatformFee[];
  sessionUserId: string | null;
  viewingShopId: string | null;
  currentUser: string;
};

export function emptyShopBag(settings?: M.Settings): ShopBag {
  const s = settings ?? M.defaultSettings({
    name: "My Shop", phone: "", email: "", city: "", plan: "Business",
  });
  return {
    products: [], categories: [], customers: [], suppliers: [],
    accounts: M.cloneDefaultAccounts(), accountBalanceLogs: [],
    sales: [], purchases: [], expenses: [], staff: [], staffTxns: [],
    adjustments: [], saleReturns: [], purchaseReturns: [],
    notifications: [], held: [],
    settings: s,
    nextInvoice: s.invoice.startNumber,
    nextPurchase: 501,
    rolePermissions: defaultRolePermissions(),
  };
}

function normalizeUser(u: M.User & { shopId?: string | null; isPlatformAdmin?: boolean }): M.User {
  const isAdmin = !!u.isPlatformAdmin || M.isPlatformAdminEmail(u.email);
  const next: M.User = {
    ...u,
    password: u.password || "",
    shopId: isAdmin ? null : (u.shopId ?? null),
    isPlatformAdmin: isAdmin,
  };
  if (u.authId) next.authId = u.authId;
  else delete next.authId;
  return next;
}

function seedRoot(): RootState {
  return {
    shops: M.shops.map((s) => ({ ...s })),
    bags: {},
    allUsers: M.users.map((u) => normalizeUser(u)),
    platformFees: [],
    sessionUserId: null,
    viewingShopId: null,
    currentUser: "Guest",
  };
}

function normalizeBag(bag: Partial<ShopBag> | undefined): ShopBag {
  return { ...emptyShopBag(), ...(bag ?? {}) };
}

/** Drop seeded demo shops, orphan test shops (no users), and related fees/bags. */
function stripDemoShop(state: RootState): { state: RootState; changed: boolean } {
  const linkedShopIds = new Set(
    state.allUsers.map((u) => u.shopId).filter((id): id is string => !!id),
  );
  const removeIds = new Set(
    state.shops
      .filter(
        (s) =>
          s.id === M.DEMO_SHOP_ID ||
          s.email?.toLowerCase() === "owner@demoshop.pk" ||
          s.name === "Demo Accessories" ||
          !linkedShopIds.has(s.id),
      )
      .map((s) => s.id),
  );
  const hadDemoBag = !!state.bags[M.DEMO_SHOP_ID];
  if (removeIds.size === 0 && !hadDemoBag) return { state, changed: false };

  const shops = state.shops.filter((s) => !removeIds.has(s.id));
  const bags = { ...state.bags };
  for (const id of removeIds) delete bags[id];
  delete bags[M.DEMO_SHOP_ID];
  const allUsers = state.allUsers.filter(
    (u) =>
      !removeIds.has(u.shopId ?? "") &&
      u.email?.toLowerCase() !== "owner@demoshop.pk" &&
      u.id !== "u1",
  );
  const platformFees = (state.platformFees ?? []).filter((f) => !removeIds.has(f.shopId));
  const viewingShopId =
    state.viewingShopId && bags[state.viewingShopId] ? state.viewingShopId : null;
  return {
    state: { ...state, shops, bags, allUsers, platformFees, viewingShopId },
    changed: true,
  };
}

function hydrateFromPersist(data: {
  shops: M.Shop[];
  bags: Record<string, Partial<ShopBag>>;
  allUsers: M.User[];
  platformFees?: M.PlatformFee[];
  sessionUserId: string | null;
  viewingShopId: string | null;
  currentUser?: string;
}): { state: RootState; changed: boolean } {
  const seed = seedRoot();
  const allUsers = (data.allUsers?.length ? data.allUsers : seed.allUsers).map(normalizeUser);
  const sessionUser = allUsers.find((u) => u.id === data.sessionUserId);
  // Prefer persisted shops even when empty — never re-inject seed demo shops.
  const shops = Array.isArray(data.shops) ? data.shops : seed.shops;
  const rawBags = data.bags && typeof data.bags === "object" ? data.bags : seed.bags;
  const bags: Record<string, ShopBag> = {};
  for (const shop of shops) {
    bags[shop.id] = pruneBag(normalizeBag(rawBags[shop.id]));
  }
  for (const [id, bag] of Object.entries(rawBags)) {
    if (!bags[id] && id !== M.DEMO_SHOP_ID) bags[id] = pruneBag(normalizeBag(bag));
  }
  return stripDemoShop({
    shops,
    bags,
    allUsers,
    platformFees: Array.isArray(data.platformFees)
      ? data.platformFees.slice(0, RETENTION.platformFees)
      : [],
    sessionUserId: sessionUser ? data.sessionUserId : null,
    viewingShopId: data.viewingShopId && bags[data.viewingShopId] ? data.viewingShopId : null,
    currentUser: sessionUser?.name ?? data.currentUser ?? "Guest",
  });
}

function loadRoot(): RootState {
  if (typeof window === "undefined") return seedRoot();
  try {
    const split = loadPersistedRoot();
    if (split) {
      const { state, changed } = hydrateFromPersist({
        ...split,
        bags: split.bags as Record<string, Partial<ShopBag>>,
      });
      // Persist stripped demo so it does not come back on next load.
      if (changed) saveRoot(state);
      return state;
    }

    // Migrate legacy single-tenant auth blob (users/settings only — no demo shop).
    const legacy = localStorage.getItem(AUTH_KEY_LEGACY);
    if (legacy) {
      const old = JSON.parse(legacy) as {
        users?: M.User[];
        rolePermissions?: RolePermissions;
        sessionUserId?: string | null;
        settings?: M.Settings;
      };
      const seeded = seedRoot();
      if (old.users?.length) {
        const migrated = old.users.map((u) =>
          normalizeUser({
            ...u,
            shopId: M.isPlatformAdminEmail(u.email) ? null : (u.shopId ?? null),
            isPlatformAdmin: M.isPlatformAdminEmail(u.email),
          }),
        );
        const hasAdmin = migrated.some((u) => u.isPlatformAdmin);
        seeded.allUsers = hasAdmin
          ? migrated
          : [...seedRoot().allUsers.filter((u) => u.isPlatformAdmin), ...migrated];
      }
      const sessionUser = seeded.allUsers.find((u) => u.id === old.sessionUserId);
      seeded.sessionUserId = sessionUser ? old.sessionUserId ?? null : null;
      seeded.currentUser = sessionUser?.name ?? "Guest";
      return stripDemoShop(seeded).state;
    }
  } catch {
    /* fall through */
  }
  return seedRoot();
}

function toPersistRoot(r: RootState): PersistRoot {
  return {
    shops: r.shops,
    bags: r.bags as PersistRoot["bags"],
    allUsers: r.allUsers,
    platformFees: r.platformFees,
    sessionUserId: r.sessionUserId,
    viewingShopId: r.viewingShopId,
    currentUser: r.currentUser,
  };
}

function saveRoot(r: RootState) {
  const persistRoot = toPersistRoot(r);
  schedulePersist(persistRoot);
  scheduleNeonSync(persistRoot);
}

function replaceRoot(next: RootState, opts?: { persistLocal?: boolean; syncNeon?: boolean }) {
  root = next;
  invalidateSnapshots();
  if (opts?.persistLocal !== false) {
    schedulePersist(toPersistRoot(root));
  }
  if (opts?.syncNeon) {
    scheduleNeonSync(toPersistRoot(root));
  }
  listeners.forEach((l) => l());
}

/**
 * Apply a Neon pull without letting an empty server bag wipe records that only exist in this browser.
 * Local-only rows are pushed back up on the next sync.
 */
function adoptPulledRoot(pulled: PersistRoot) {
  const local = toPersistRoot(root);
  const { bags, keptLocalRecords } = mergePulledBags(
    pulled.bags,
    local.bags,
    pulled.shops.map((s) => s.id),
  );
  const { state, changed } = hydrateFromPersist({
    shops: pulled.shops,
    bags: bags as Record<string, Partial<ShopBag>>,
    allUsers: pulled.allUsers.length ? pulled.allUsers : local.allUsers,
    platformFees: pulled.platformFees.length ? pulled.platformFees : local.platformFees,
    sessionUserId: null,
    viewingShopId: null,
  });
  replaceRoot(state, { persistLocal: true, syncNeon: changed || keptLocalRecords });
}

function provisionPlatformAdmin(auth: { id: string; email: string; name: string }): M.User {
  const existing = root.allUsers.find(
    (u) => u.email.toLowerCase() === auth.email.trim().toLowerCase(),
  );
  if (existing) {
    const linked = root.allUsers.map((u) =>
      u.id === existing.id
        ? { ...u, authId: auth.id, isPlatformAdmin: true, shopId: null, password: "" }
        : u,
    );
    replaceRoot({ ...root, allUsers: linked }, { syncNeon: true });
    return linked.find((u) => u.id === existing.id)!;
  }
  const user: M.User = {
    id: uid("u"),
    name: auth.name || "Platform Admin",
    email: auth.email.trim(),
    phone: "",
    role: "Owner",
    status: "Active",
    password: "",
    lastLogin: "",
    shopId: null,
    isPlatformAdmin: true,
    authId: auth.id,
  };
  replaceRoot({ ...root, allUsers: [...root.allUsers, user] }, { syncNeon: true });
  return user;
}

/** Cap noisy lists in memory so UI stays snappy (same limits as disk). */
function capNotes(list: M.AppNotification[]): M.AppNotification[] {
  return list.length <= RETENTION.notifications ? list : list.slice(0, RETENTION.notifications);
}
function capHeld(list: M.HeldSale[]): M.HeldSale[] {
  return list.length <= RETENTION.held ? list : list.slice(0, RETENTION.held);
}
function capLogs(list: M.AccountBalanceLog[]): M.AccountBalanceLog[] {
  return list.length <= RETENTION.accountBalanceLogs ? list : list.slice(0, RETENTION.accountBalanceLogs);
}
function withLowStockNotes(prev: M.Product[], next: M.Product[], existing: M.AppNotification[]) {
  return capNotes([...lowStockNotes(prev, next), ...existing]);
}

let root: RootState = loadRoot();

function activeShopIdOf(r: RootState = root): string | null {
  const user = r.allUsers.find((u) => u.id === r.sessionUserId);
  if (!user) return null;
  if (user.isPlatformAdmin) return r.viewingShopId;
  return user.shopId;
}

function project(r: RootState = root): State {
  const activeShopId = activeShopIdOf(r);
  const stored = activeShopId ? r.bags[activeShopId] : undefined;
  const bag = stored ? { ...emptyShopBag(), ...stored } : emptyShopBag();
  const users = activeShopId
    ? r.allUsers.filter((u) => u.shopId === activeShopId && !u.isPlatformAdmin)
    : [];
  return {
    ...bag,
    users,
    shops: r.shops ?? [],
    sessionUserId: r.sessionUserId,
    viewingShopId: r.viewingShopId,
    currentUser: r.currentUser,
    activeShopId,
  };
}

function applyPatch(r: RootState, patch: Partial<State>): RootState {
  const next: RootState = {
    ...r,
    bags: { ...r.bags },
    shops: [...r.shops],
    allUsers: [...r.allUsers],
  };
  if ("sessionUserId" in patch) next.sessionUserId = patch.sessionUserId ?? null;
  if ("viewingShopId" in patch) next.viewingShopId = patch.viewingShopId ?? null;
  if ("currentUser" in patch && patch.currentUser !== undefined) next.currentUser = patch.currentUser;
  if ("shops" in patch && patch.shops) next.shops = patch.shops;

  const shopId = activeShopIdOf(next);

  if ("users" in patch && patch.users) {
    if (shopId) {
      const others = next.allUsers.filter((u) => u.isPlatformAdmin || u.shopId !== shopId);
      const shopUsers = patch.users.map((u) =>
        normalizeUser({ ...u, shopId, isPlatformAdmin: false }),
      );
      next.allUsers = [...others, ...shopUsers];
    }
  }

  if (shopId) {
    const prevBag = next.bags[shopId] ?? emptyShopBag();
    const bagPatch: Partial<ShopBag> = {};
    let touched = false;
    for (const key of SHOP_KEYS) {
      if (key in patch) {
        (bagPatch as Record<string, unknown>)[key] = patch[key];
        touched = true;
      }
    }
    if (touched) next.bags[shopId] = { ...prevBag, ...bagPatch };
  }

  return next;
}

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Cached snapshots — useSyncExternalStore requires a stable getSnapshot reference until data changes. */
let cachedState: State | null = null;
let cachedPlatform: PlatformView | null = null;

/** Gates route redirects until Neon session has been synced into the local store. */
let authReady = false;
const authListeners = new Set<() => void>();

function setAuthReady(ready: boolean) {
  if (authReady === ready) return;
  authReady = ready;
  authListeners.forEach((l) => l());
}

export function getAuthReady() {
  return authReady;
}

export function useAuthReady() {
  return useSyncExternalStore(
    (cb) => {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    () => authReady,
    () => false,
  );
}

function invalidateSnapshots() {
  cachedState = null;
  cachedPlatform = null;
}

function clearLocalSession(opts?: { flush?: boolean }) {
  commitRoot(
    { ...root, sessionUserId: null, viewingShopId: null, currentUser: "Guest" },
    { flush: opts?.flush ?? true },
  );
}

function findLocalUserByAuth(authId: string, email: string): M.User | undefined {
  const byAuth = root.allUsers.find((u) => u.authId && u.authId === authId);
  if (byAuth) return byAuth;
  return root.allUsers.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

function applyLocalSession(user: M.User, authId?: string) {
  const asAdmin = M.isPlatformAdminEmail(user.email);
  const linked = root.allUsers.map((u) => {
    if (u.id !== user.id) return u;
    return {
      ...u,
      ...(authId && u.authId !== authId ? { authId } : {}),
      lastLogin: now(),
      ...(asAdmin ? { isPlatformAdmin: true as const, shopId: null } : {}),
    };
  });
  const nextUser = linked.find((u) => u.id === user.id) ?? user;
  commitRoot(
    {
      ...root,
      allUsers: linked,
      sessionUserId: nextUser.id,
      viewingShopId: null,
      currentUser: nextUser.name,
    },
    { flush: true },
  );
  return nextUser;
}

/**
 * Sync Neon Auth cookie session → store, and pull shop data from Neon Data API.
 * Call once on app boot before trusting route guards.
 */
export async function hydrateAuthSession(): Promise<void> {
  try {
    const session = await getNeonSession();
    if (!session?.user) {
      if (root.sessionUserId) clearLocalSession();
      return;
    }

    if (isNeonDataConfigured()) {
      try {
        const pulled = await pullRootFromNeon();
        if (neonRootHasData(pulled)) {
          adoptPulledRoot(pulled!);
        } else {
          // Neon empty — one-time migrate from localStorage cache.
          const local = loadPersistedRoot();
          if (local && neonRootHasData(local)) {
            const { state } = hydrateFromPersist({
              shops: local.shops,
              bags: local.bags as Record<string, Partial<ShopBag>>,
              allUsers: local.allUsers,
              platformFees: local.platformFees,
              sessionUserId: null,
              viewingShopId: null,
            });
            replaceRoot(state, { persistLocal: true });
            const pushed = await pushRootToNeon(toPersistRoot(state));
            if (!pushed.ok) {
              console.warn("[neon-sync] local→Neon migration failed:", pushed.error);
            }
          }
        }
      } catch (err) {
        console.warn("[neon-sync] hydrate pull failed; using local cache", err);
      }
    }

    let local = findLocalUserByAuth(session.user.id, session.user.email);
    if (!local && M.isPlatformAdminEmail(session.user.email)) {
      local = provisionPlatformAdmin(session.user);
    }
    if (!local) {
      // Neon session without a shop profile — keep Neon signed in but no app session.
      clearLocalSession({ flush: true });
      return;
    }
    if (local.status !== "Active") {
      await neonSignOut();
      clearLocalSession();
      return;
    }
    applyLocalSession(local, session.user.id);
  } finally {
    setAuthReady(true);
  }
}

function commitRoot(next: RootState, opts?: { flush?: boolean }) {
  root = next;
  invalidateSnapshots();
  saveRoot(root);
  if (opts?.flush) {
    flushPersist();
    void flushNeonSync();
  }
  listeners.forEach((l) => l());
}

export function setState(fn: (s: State) => Partial<State>) {
  const patch = fn(getState());
  commitRoot(applyPatch(root, patch));
}

export function getState(): State {
  if (!cachedState) cachedState = project(root);
  return cachedState;
}

export function getRootState(): RootState {
  return root;
}

export function useDB() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export type PlatformView = {
  shops: M.Shop[];
  users: M.User[];
  platformFees: M.PlatformFee[];
  sessionUserId: string | null;
  viewingShopId: string | null;
  shopStats: (shopId: string) => { products: number; sales: number; customers: number; users: number };
};

function platformView(): PlatformView {
  if (!cachedPlatform) {
    cachedPlatform = {
      shops: root.shops,
      users: root.allUsers.filter((u) => !u.isPlatformAdmin),
      platformFees: root.platformFees ?? [],
      sessionUserId: root.sessionUserId,
      viewingShopId: root.viewingShopId,
      shopStats: (shopId: string) => {
        const bag = root.bags[shopId];
        return {
          products: bag?.products?.length ?? 0,
          sales: bag?.sales?.length ?? 0,
          customers: bag?.customers?.length ?? 0,
          users: root.allUsers.filter((u) => u.shopId === shopId && !u.isPlatformAdmin).length,
        };
      },
    };
  }
  return cachedPlatform;
}

export function usePlatform(): PlatformView {
  return useSyncExternalStore(subscribe, platformView, platformView);
}

export function getSessionUser(_s?: State) {
  if (!root.sessionUserId) return null;
  return root.allUsers.find((u) => u.id === root.sessionUserId) ?? null;
}

export function useSessionUser() {
  useDB();
  return getSessionUser();
}

export function useCan(module: PermModule, action: PermAction = "View") {
  const user = useSessionUser();
  const db = useDB();
  if (!user) return false;
  if (user.isPlatformAdmin && db.activeShopId) return true;
  return can(db.rolePermissions, user.role, module, action);
}

export function sessionCanAccess(pathname: string, s: State = getState()) {
  const user = getSessionUser();
  if (!user || user.status !== "Active") return false;
  if (user.isPlatformAdmin && s.activeShopId) return true;
  return canAccessPath(s.rolePermissions, user.role, pathname);
}

export function sessionHome(_s?: State) {
  const user = getSessionUser();
  if (!user) return "/login";
  if (user.isPlatformAdmin && !root.viewingShopId) return "/admin";
  const s = getState();
  return firstAllowedPath(s.rolePermissions, user.isPlatformAdmin ? "Owner" : user.role);
}

export function isPlatformAdmin(user: M.User | null | undefined) {
  return !!user?.isPlatformAdmin;
}

const now = () => new Date().toISOString();
const sumItems = (items: M.LineItem[]) => items.reduce((a, b) => a + b.qty * b.price, 0);

export const saleProfit = (s: M.Sale) => s.items.reduce((a, i) => a + (i.price - i.cost) * i.qty, 0) - s.discount;
export const due = (d: { total: number; paid: number; status?: string }) =>
  d.status === "Returned" ? 0 : Math.max(0, d.total - d.paid);

/** Return value after allocating invoice discount/tax onto returned lines (portion of sale.total). */
export function saleReturnValue(sale: Pick<M.Sale, "subtotal" | "total">, items: M.LineItem[]): number {
  if (sale.subtotal <= 0 || items.length === 0) return 0;
  return Math.round((sumItems(items) / sale.subtotal) * sale.total);
}

export function saleRefunded(saleId: string, returns: M.SaleReturn[]) {
  return returns.filter((r) => r.saleId === saleId).reduce((a, r) => a + r.refund, 0);
}

/** Cash that can still be refunded for these return lines (never more than return value or remaining paid). */
export function maxSaleRefund(sale: M.Sale, returns: M.SaleReturn[], items: M.LineItem[]): number {
  const returnAmt = saleReturnValue(sale, items);
  const remainingPaid = Math.max(0, sale.paid - saleRefunded(sale.id, returns));
  return Math.max(0, Math.min(returnAmt, remainingPaid));
}

/** Due after returns: remaining goods value minus net cash kept (paid − refunded). */
export function saleDue(sale: M.Sale, returns: M.SaleReturn[]) {
  if (sale.status === "Returned") return 0;
  const ret = saleReturnedStats(sale, returns);
  const refunded = saleRefunded(sale.id, returns);
  return Math.max(0, sale.total - ret.amount - sale.paid + refunded);
}

export function saleReturnedStats(sale: M.Sale, returns: M.SaleReturn[]) {
  const items = returns.filter((r) => r.saleId === sale.id).flatMap((r) => r.items);
  return {
    qty: items.reduce((a, i) => a + i.qty, 0),
    amount: saleReturnValue(sale, items),
  };
}
export const stockStatus = (p: M.Product) => (p.stock <= 0 ? "Out of Stock" : p.stock <= p.minStock ? "Low Stock" : "In Stock");

export function findAccount(s: State, accountId: string) {
  return s.accounts.find((a) => a.id === accountId);
}
export function accountLabel(s: State, accountId: string, fallback = "—") {
  return findAccount(s, accountId)?.name ?? fallback;
}
export function isCreditAccount(s: State, accountId: string) {
  return findAccount(s, accountId)?.type === "Credit";
}
function payMeta(s: State, accountId: string) {
  const acc = findAccount(s, accountId);
  return { accountId, method: acc?.name ?? "Cash" };
}
function cashAccountId(s: State) {
  return s.accounts.find((a) => a.type === "Cash" && a.active)?.id ?? M.accountIdOf("Cash");
}
function creditAccountId(s: State) {
  return s.accounts.find((a) => a.type === "Credit" && a.active)?.id ?? M.accountIdOf("Credit");
}

export type AccountLedgerEntry = {
  id: string;
  date: string;
  kind: string;
  reference: string;
  note: string;
  inflow: number;
  outflow: number;
  /** Present when the source document (sale/purchase) or opening was edited. */
  editedAt?: string;
  /** Opening add/edit rows — shown in ledger but excluded from In/Out balance math. */
  openingAdj?: boolean;
};

export function accountStats(s: State, accountId: string) {
  const account = findAccount(s, accountId);
  const ledger: AccountLedgerEntry[] = [];

  for (const sale of s.sales) {
    for (const p of sale.payments) {
      if (p.accountId !== accountId) continue;
      ledger.push({
        id: p.id, date: p.date, kind: "Sale payment", reference: sale.invoiceNo, note: p.note ?? "",
        inflow: p.amount, outflow: 0,
        ...(sale.editedAt ? { editedAt: sale.editedAt } : {}),
      });
    }
  }
  for (const pur of s.purchases) {
    for (const p of pur.payments) {
      if (p.accountId !== accountId) continue;
      ledger.push({
        id: p.id, date: p.date, kind: "Purchase payment", reference: pur.no, note: p.note ?? "",
        inflow: 0, outflow: p.amount,
        ...(pur.editedAt ? { editedAt: pur.editedAt } : {}),
      });
    }
  }
  for (const e of s.expenses) {
    if (e.accountId !== accountId) continue;
    ledger.push({ id: e.id, date: e.date, kind: "Expense", reference: e.category, note: e.description, inflow: 0, outflow: e.amount });
  }
  for (const t of s.staffTxns) {
    if (t.accountId !== accountId || t.kind === "AdvanceCut") continue;
    ledger.push({
      id: t.id, date: t.date,
      kind: t.kind === "Advance" ? "Staff advance" : "Staff payment",
      reference: s.staff.find((x) => x.id === t.staffId)?.name ?? t.staffId,
      note: t.note, inflow: 0, outflow: t.amount,
    });
  }
  for (const r of s.saleReturns) {
    if (r.accountId !== accountId || r.refund <= 0) continue;
    ledger.push({ id: r.id, date: r.date, kind: "Sale refund", reference: r.no, note: r.reason, inflow: 0, outflow: r.refund });
  }
  for (const log of s.accountBalanceLogs) {
    if (log.accountId !== accountId) continue;
    const delta = log.next - log.previous;
    ledger.push({
      id: log.id,
      date: log.date,
      kind: log.kind === "add" ? "Balance added" : "Opening edited",
      reference: log.kind === "add" ? "Top-up" : "Edited",
      note: `${fmtOpening(log.previous)} → ${fmtOpening(log.next)}${log.by ? ` · ${log.by}` : ""}`,
      inflow: delta > 0 ? delta : 0,
      outflow: delta < 0 ? -delta : 0,
      ...(log.kind === "edit" ? { editedAt: log.date } : {}),
      openingAdj: true,
    });
  }

  ledger.sort((a, b) => b.date.localeCompare(a.date));
  const movements = ledger.filter((e) => !e.openingAdj);
  const inflow = movements.reduce((a, e) => a + e.inflow, 0);
  const outflow = movements.reduce((a, e) => a + e.outflow, 0);
  const opening = account?.openingBalance ?? 0;
  const balance = opening + inflow - outflow;

  const creditSales = s.sales.filter((x) => x.accountId === accountId && (account?.type === "Credit" || isCreditAccount(s, x.accountId)));
  const receivables = creditSales.reduce((a, x) => a + saleDue(x, s.saleReturns), 0);

  return {
    account,
    ledger,
    opening,
    inflow,
    outflow,
    balance,
    receivables,
    isCredit: account?.type === "Credit",
    hasActivity: ledger.length > 0 || (account?.type === "Credit" && creditSales.length > 0),
  };
}

function fmtOpening(n: number) {
  return `Rs ${n.toLocaleString("en-PK")}`;
}

export function accountHasActivity(s: State, accountId: string) {
  return accountStats(s, accountId).hasActivity;
}

export function customerStats(s: State, id: string) {
  const list = s.sales.filter((x) => x.customerId === id);
  const total = list.reduce((a, b) => a + b.total, 0);
  const paid = list.reduce((a, b) => a + b.paid, 0);
  const dueAmt = list.reduce((a, sale) => a + saleDue(sale, s.saleReturns), 0);
  return { list, total, paid, due: dueAmt, last: list[0]?.date };
}
export function supplierStats(s: State, id: string) {
  const list = s.purchases.filter((x) => x.supplierId === id);
  const total = list.reduce((a, b) => a + b.total, 0);
  const paid = list.reduce((a, b) => a + b.paid, 0);
  return { list, total, paid, due: Math.max(0, total - paid), last: list[0]?.date };
}

export function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function staffStats(s: State, id: string, month = currentMonthKey()) {
  const member = s.staff.find((x) => x.id === id);
  const list = s.staffTxns.filter((t) => t.staffId === id).sort((a, b) => b.date.localeCompare(a.date));
  const monthTxns = list.filter((t) => t.forMonth === month);
  const paid = monthTxns.filter((t) => t.kind === "Payment").reduce((a, b) => a + b.amount, 0);
  const advanceCut = monthTxns.filter((t) => t.kind === "AdvanceCut").reduce((a, b) => a + b.amount, 0);
  const advanceGiven = monthTxns.filter((t) => t.kind === "Advance").reduce((a, b) => a + b.amount, 0);
  const unpaidAdvance = Math.max(
    0,
    list.filter((t) => t.kind === "Advance").reduce((a, b) => a + b.amount, 0)
      - list.filter((t) => t.kind === "AdvanceCut").reduce((a, b) => a + b.amount, 0),
  );
  const salary = member ? M.salaryDueAmount(member, month) : 0;
  return {
    list,
    monthTxns,
    salary,
    paid,
    advanceGiven,
    advanceCut,
    unpaidAdvance,
    /** @deprecated use unpaidAdvance — kept as unpaid balance for list column */
    advance: unpaidAdvance,
    remaining: Math.max(0, salary - paid - advanceCut),
  };
}

function lowStockNotes(before: M.Product[], after: M.Product[]): M.AppNotification[] {
  const out: M.AppNotification[] = [];
  after.forEach((p) => {
    const b = before.find((x) => x.id === p.id);
    if (b && b.stock > p.minStock && p.stock <= p.minStock)
      out.push({ id: uid("n"), title: `${p.name} is ${p.stock <= 0 ? "out of" : "low in"} stock.`, description: `${p.stock} left. Minimum is ${p.minStock}.`, time: now(), read: false, kind: "stock" });
  });
  return out;
}

function payDocs<T extends { id: string; total: number; paid: number; status: M.DocStatus; payments: M.Payment[]; date: string }>(
  docs: T[],
  match: (d: T) => boolean,
  amount: number,
  accountId: string,
  method: string,
  getDue: (d: T) => number = (d) => due(d),
) {
  let left = amount;
  const ids = docs.filter((d) => match(d) && getDue(d) > 0).sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.id);
  return docs.map((d) => {
    if (!ids.includes(d.id) || left <= 0) return d;
    const pay = Math.min(left, getDue(d));
    left -= pay;
    const paid = d.paid + pay;
    return { ...d, paid, status: M.statusOf(d.total, paid), payments: [...d.payments, { id: uid("pay"), date: now(), amount: pay, method, accountId }] };
  });
}

export const actions = {
  saveAccount(input: Omit<M.Account, "id"> & { id?: string }) {
    if (input.id) {
      const prev = findAccount(getState(), input.id);
      const openingChanged = !!prev && input.openingBalance !== prev.openingBalance;
      setState((s) => {
        const accounts = s.accounts.map((a) => {
          if (a.id !== input.id) return a;
          return {
            ...a,
            ...input,
            id: a.id,
            openingBalanceEdited: openingChanged ? true : (a.openingBalanceEdited ?? false),
          };
        });
        if (!openingChanged || !prev) return { accounts };
        const log: M.AccountBalanceLog = {
          id: uid("abl"),
          accountId: input.id!,
          date: now(),
          kind: "edit",
          previous: prev.openingBalance,
          next: input.openingBalance,
          by: s.currentUser,
        };
        return { accounts, accountBalanceLogs: capLogs([log, ...s.accountBalanceLogs]) };
      });
      return input.id;
    }
    const id = uid("acc");
    setState((s) => ({ accounts: [...s.accounts, { ...input, id, openingBalanceEdited: false }] }));
    return id;
  },
  /** Adds amount to the account opening balance (top-up). Does not mark opening as edited. */
  addAccountBalance(id: string, amount: number): "ok" | "not_found" | "invalid" {
    if (!Number.isFinite(amount) || amount <= 0) return "invalid";
    const acc = findAccount(getState(), id);
    if (!acc) return "not_found";
    const previous = acc.openingBalance;
    const next = previous + amount;
    setState((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, openingBalance: next } : a)),
      accountBalanceLogs: capLogs([
        { id: uid("abl"), accountId: id, date: now(), kind: "add", previous, next, by: s.currentUser },
        ...s.accountBalanceLogs,
      ]),
    }));
    return "ok";
  },
  /** Sets absolute opening balance and marks it as edited when the value changes. */
  setOpeningBalance(id: string, openingBalance: number): "ok" | "not_found" | "invalid" {
    if (!Number.isFinite(openingBalance) || openingBalance < 0) return "invalid";
    const acc = findAccount(getState(), id);
    if (!acc) return "not_found";
    const changed = openingBalance !== acc.openingBalance;
    if (!changed) return "ok";
    const previous = acc.openingBalance;
    setState((s) => ({
      accounts: s.accounts.map((a) =>
        a.id === id
          ? { ...a, openingBalance, openingBalanceEdited: true }
          : a
      ),
      accountBalanceLogs: capLogs([
        { id: uid("abl"), accountId: id, date: now(), kind: "edit", previous, next: openingBalance, by: s.currentUser },
        ...s.accountBalanceLogs,
      ]),
    }));
    return "ok";
  },
  deleteAccount(id: string): "ok" | "has_activity" | "not_found" {
    const s = getState();
    if (!findAccount(s, id)) return "not_found";
    if (accountHasActivity(s, id)) {
      setState((st) => ({ accounts: st.accounts.map((a) => (a.id === id ? { ...a, active: false } : a)) }));
      return "has_activity";
    }
    setState((st) => ({ accounts: st.accounts.filter((a) => a.id !== id) }));
    return "ok";
  },
  addProduct(p: Omit<M.Product, "id">) {
    const id = uid("p");
    const openingQty = Math.max(0, Math.floor(p.stock) || 0);
    // Catalogue starts at 0; opening stock is recorded as a purchase so history stays correct.
    setState((s) => ({ products: [{ ...p, id, stock: 0 }, ...s.products] }));
    if (openingQty > 0 && p.supplierId) {
      actions.addPurchase({
        supplierId: p.supplierId,
        items: [{ productId: id, name: p.name, qty: openingQty, price: p.purchasePrice, cost: p.purchasePrice }],
        discount: 0,
        paid: 0,
        notes: "Opening stock from new product",
        accountId: creditAccountId(getState()),
      });
    }
    return id;
  },
  updateProduct(id: string, patch: Partial<M.Product>) {
    setState((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  deleteProduct(id: string) {
    setState((s) => ({ products: s.products.filter((p) => p.id !== id) }));
  },
  saveCategory(c: Omit<M.Category, "id"> & { id?: string }) {
    setState((s) => ({
      categories: c.id
        ? s.categories.map((x) => (x.id === c.id ? { ...x, name: c.name, description: c.description, parentId: c.parentId ?? null, id: x.id } : x))
        : [...s.categories, { name: c.name, description: c.description, parentId: c.parentId ?? null, id: uid("c") }],
    }));
  },
  deleteCategory(id: string) {
    const hasProducts = getState().products.some((p) => p.categoryId === id || getState().categories.some((c) => c.parentId === id && p.categoryId === c.id));
    const hasChildren = getState().categories.some((c) => c.parentId === id);
    if (hasProducts || hasChildren) return false;
    setState((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
    return true;
  },
  saveCustomer(c: Omit<M.Customer, "id" | "createdAt"> & { id?: string }) {
    if (c.id) {
      setState((s) => ({ customers: s.customers.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x)) }));
      return c.id;
    }
    const id = uid("cu");
    setState((s) => ({ customers: [{ ...c, id, createdAt: now() }, ...s.customers] }));
    return id;
  },
  deleteCustomer(id: string) {
    setState((s) => ({ customers: s.customers.filter((c) => c.id !== id) }));
  },
  saveSupplier(c: Omit<M.Supplier, "id" | "createdAt"> & { id?: string }) {
    setState((s) => ({
      suppliers: c.id ? s.suppliers.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x)) : [{ ...c, id: uid("s"), createdAt: now() }, ...s.suppliers],
    }));
  },
  deleteSupplier(id: string) {
    setState((s) => ({ suppliers: s.suppliers.filter((c) => c.id !== id) }));
  },
  completeSale(input: { customerId: string | null; items: M.LineItem[]; discount: number; accountId: string; received: number; notes?: string }): M.Sale {
    const s = getState();
    const acc = findAccount(s, input.accountId);
    const credit = acc?.type === "Credit";
    const subtotal = sumItems(input.items);
    const taxed = s.settings.tax.enabled ? subtotal * (1 + s.settings.tax.rate / 100) : subtotal;
    const total = Math.max(0, Math.round(taxed - input.discount));
    const paid = Math.min(input.received, total);
    const change = credit ? 0 : Math.max(0, input.received - total);
    const date = now();
    const payAccId = credit ? cashAccountId(s) : input.accountId;
    const sale: M.Sale = {
      id: uid("sa"), invoiceNo: `${s.settings.invoice.prefix}-${s.nextInvoice}`, date, customerId: input.customerId, items: input.items,
      discount: input.discount, subtotal, total, paid, change, ...payMeta(s, input.accountId), status: M.statusOf(total, paid), cashier: s.currentUser,
      notes: input.notes ?? "", payments: paid > 0 ? [{ id: uid("pay"), date, amount: paid, ...payMeta(s, payAccId) }] : [],
    };
    const products = s.products.map((p) => {
      const it = input.items.find((i) => i.productId === p.id);
      return it ? { ...p, stock: p.stock - it.qty } : p;
    });
    setState(() => ({ sales: [sale, ...s.sales], products, nextInvoice: s.nextInvoice + 1, notifications: withLowStockNotes(s.products, products, s.notifications) }));
    return sale;
  },
  updateSale(saleId: string, input: { customerId: string | null; items: M.LineItem[]; discount: number; accountId: string; received: number; notes?: string }): M.Sale | null {
    const s = getState();
    const existing = s.sales.find((x) => x.id === saleId);
    if (!existing || existing.status === "Returned") return null;
    if (s.saleReturns.some((r) => r.saleId === saleId)) return null;
    const restored = s.products.map((p) => {
      const old = existing.items.find((i) => i.productId === p.id);
      return old ? { ...p, stock: p.stock + old.qty } : p;
    });
    for (const it of input.items) {
      const p = restored.find((x) => x.id === it.productId);
      if (!p || it.qty > p.stock) return null;
    }
    const products = restored.map((p) => {
      const it = input.items.find((i) => i.productId === p.id);
      return it ? { ...p, stock: p.stock - it.qty } : p;
    });
    const credit = isCreditAccount(s, input.accountId);
    const subtotal = sumItems(input.items);
    const taxed = s.settings.tax.enabled ? subtotal * (1 + s.settings.tax.rate / 100) : subtotal;
    const total = Math.max(0, Math.round(taxed - input.discount));
    const paid = Math.min(input.received, total);
    const change = credit ? 0 : Math.max(0, input.received - total);
    const date = now();
    const payAccId = credit ? cashAccountId(s) : input.accountId;
    const sale: M.Sale = {
      ...existing,
      customerId: input.customerId,
      items: input.items,
      discount: input.discount,
      subtotal,
      total,
      paid,
      change,
      ...payMeta(s, input.accountId),
      status: M.statusOf(total, paid),
      notes: input.notes ?? existing.notes,
      editedAt: date,
      payments: paid > 0 ? [{ id: uid("pay"), date, amount: paid, ...payMeta(s, payAccId) }] : [],
    };
    setState(() => ({
      sales: s.sales.map((x) => (x.id === saleId ? sale : x)),
      products,
      notifications: withLowStockNotes(s.products, products, s.notifications),
    }));
    return sale;
  },
  recordSalePayment(saleId: string, amount: number, accountId: string) {
    const meta = payMeta(getState(), accountId);
    setState((s) => ({
      sales: payDocs(s.sales, (d) => d.id === saleId, amount, meta.accountId, meta.method, (d) => saleDue(d, s.saleReturns)),
    }));
  },
  recordCustomerPayment(customerId: string, amount: number, accountId: string) {
    const meta = payMeta(getState(), accountId);
    setState((s) => ({
      sales: payDocs(s.sales, (d) => d.customerId === customerId, amount, meta.accountId, meta.method, (d) => saleDue(d, s.saleReturns)),
    }));
  },
  recordSupplierPayment(supplierId: string, amount: number, accountId: string) {
    const meta = payMeta(getState(), accountId);
    setState((s) => ({ purchases: payDocs(s.purchases, (d) => d.supplierId === supplierId, amount, meta.accountId, meta.method) }));
  },
  recordPurchasePayment(id: string, amount: number, accountId: string) {
    const meta = payMeta(getState(), accountId);
    setState((s) => ({ purchases: payDocs(s.purchases, (d) => d.id === id, amount, meta.accountId, meta.method) }));
  },
  addPurchase(input: { supplierId: string; items: M.LineItem[]; discount: number; paid: number; notes: string; accountId?: string }) {
    const s = getState();
    const subtotal = sumItems(input.items);
    const total = Math.max(0, subtotal - input.discount);
    const accountId = input.accountId ?? cashAccountId(s);
    const credit = isCreditAccount(s, accountId);
    const paid = credit ? 0 : Math.min(input.paid, total);
    const date = now();
    const pur: M.Purchase = {
      id: uid("pu"), no: `PUR-${s.nextPurchase}`, date, supplierId: input.supplierId, items: input.items, discount: input.discount, subtotal, total,
      paid, status: M.statusOf(total, paid), notes: input.notes, payments: paid > 0 ? [{ id: uid("pay"), date, amount: paid, ...payMeta(s, accountId) }] : [],
    };
    setState(() => ({
      purchases: [pur, ...s.purchases], nextPurchase: s.nextPurchase + 1,
      products: s.products.map((p) => {
        const it = input.items.find((i) => i.productId === p.id);
        return it ? { ...p, stock: p.stock + it.qty, purchasePrice: it.price } : p;
      }),
    }));
    return pur;
  },
  updatePurchase(purchaseId: string, input: { supplierId: string; items: M.LineItem[]; discount: number; paid: number; notes: string; accountId?: string }): M.Purchase | null {
    const s = getState();
    const existing = s.purchases.find((x) => x.id === purchaseId);
    if (!existing || existing.status === "Returned") return null;
    if (s.purchaseReturns.some((r) => r.purchaseId === purchaseId)) return null;
    for (const it of existing.items) {
      const p = s.products.find((x) => x.id === it.productId);
      if (!p || p.stock < it.qty) return null;
    }
    const reversed = s.products.map((p) => {
      const old = existing.items.find((i) => i.productId === p.id);
      return old ? { ...p, stock: p.stock - old.qty } : p;
    });
    const products = reversed.map((p) => {
      const it = input.items.find((i) => i.productId === p.id);
      return it ? { ...p, stock: p.stock + it.qty, purchasePrice: it.price } : p;
    });
    const subtotal = sumItems(input.items);
    const total = Math.max(0, subtotal - input.discount);
    const accountId = input.accountId ?? cashAccountId(s);
    const credit = isCreditAccount(s, accountId);
    const paid = credit ? 0 : Math.min(input.paid, total);
    const date = now();
    const pur: M.Purchase = {
      ...existing,
      supplierId: input.supplierId,
      items: input.items,
      discount: input.discount,
      subtotal,
      total,
      paid,
      status: M.statusOf(total, paid),
      notes: input.notes,
      editedAt: date,
      payments: paid > 0 ? [{ id: uid("pay"), date, amount: paid, ...payMeta(s, accountId) }] : [],
    };
    setState(() => ({
      purchases: s.purchases.map((x) => (x.id === purchaseId ? pur : x)),
      products,
      notifications: withLowStockNotes(s.products, products, s.notifications),
    }));
    return pur;
  },
  saveExpense(e: Omit<M.Expense, "id"> & { id?: string }) {
    setState((s) => ({ expenses: e.id ? s.expenses.map((x) => (x.id === e.id ? { ...x, ...e, id: x.id } : x)) : [{ ...e, id: uid("e") }, ...s.expenses] }));
  },
  deleteExpense(id: string) {
    setState((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },
  saveUser(
    u: Omit<M.User, "id" | "lastLogin" | "password" | "shopId" | "isPlatformAdmin"> & {
      id?: string;
      password?: string;
      authId?: string;
    },
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    return (async () => {
      const shopId = activeShopIdOf(root);
      if (!shopId && !u.id) {
        return { ok: false, error: "No active shop to attach this user to." };
      }

      if (u.id) {
        const existing = root.allUsers.find((x) => x.id === u.id);
        if (!existing) return { ok: false, error: "User not found." };

        if (u.password) {
          if (!existing.authId) {
            return {
              ok: false,
              error:
                "This user is not linked to Neon Auth yet. Create a new login or ask them to sign up.",
            };
          }
          const pw = await neonAdminSetPassword(existing.authId, u.password);
          if (!pw.ok) return pw;
        }

        commitRoot({
          ...root,
          allUsers: root.allUsers.map((x) => {
            if (x.id !== u.id) return x;
            return {
              ...x,
              name: u.name,
              email: u.email,
              phone: u.phone,
              role: u.role,
              status: u.status,
              // Password is stored in Neon — keep local field empty / unchanged marker.
              password: "",
            };
          }),
          currentUser:
            root.sessionUserId === u.id ? u.name : root.currentUser,
        });
        return { ok: true, id: u.id };
      }

      if (!u.password) return { ok: false, error: "Password is required for new users." };

      // Requires Neon Auth admin role on the signed-in account (Console → Make admin).
      const created = await neonAdminCreateUser({
        email: u.email,
        password: u.password,
        name: u.name,
      });
      if (!created.ok) return created;

      if (root.allUsers.some((x) => x.email.toLowerCase() === u.email.trim().toLowerCase())) {
        return { ok: false, error: "Email already in use." };
      }

      const id = uid("u");
      const user: M.User = {
        id,
        name: u.name.trim(),
        email: u.email.trim(),
        phone: u.phone.trim(),
        role: u.role,
        status: u.status,
        password: "",
        lastLogin: "",
        shopId: shopId!,
        isPlatformAdmin: false,
        authId: created.data.id,
      };
      commitRoot({ ...root, allUsers: [...root.allUsers, user] });
      return { ok: true, id };
    })();
  },
  deleteUser(id: string) {
    setState((s) => ({
      users: s.users.filter((u) => u.id !== id),
      sessionUserId: s.sessionUserId === id ? null : s.sessionUserId,
      viewingShopId: s.sessionUserId === id ? null : s.viewingShopId,
      currentUser: s.sessionUserId === id ? "Guest" : s.currentUser,
    }));
  },
  saveRolePermissions(perms: RolePermissions) {
    setState(() => ({ rolePermissions: perms }));
  },
  async login(
    email: string,
    password: string,
    rememberMe = true,
  ): Promise<{ ok: true; user: M.User } | { ok: false; error: string }> {
    const auth = await neonSignIn(email, password, rememberMe);
    if (!auth.ok) return auth;

    if (isNeonDataConfigured()) {
      try {
        const pulled = await pullRootFromNeon();
        if (neonRootHasData(pulled)) {
          adoptPulledRoot(pulled!);
        }
      } catch (err) {
        console.warn("[neon-sync] login pull failed", err);
      }
    }

    let user = findLocalUserByAuth(auth.data.id, auth.data.email);
    if (!user && M.isPlatformAdminEmail(auth.data.email)) {
      user = provisionPlatformAdmin(auth.data);
    }
    if (!user) {
      await neonSignOut();
      return {
        ok: false,
        error: "No shop account found for this email. Ask the owner to add you in Users.",
      };
    }
    if (user.status !== "Active") {
      await neonSignOut();
      return { ok: false, error: "This account is inactive. Contact the owner." };
    }
    if (!user.isPlatformAdmin && user.shopId) {
      const shop = root.shops.find((s) => s.id === user.shopId);
      if (!shop) {
        await neonSignOut();
        return { ok: false, error: "Shop not found for this account." };
      }
      if (shop.status === "Suspended") {
        await neonSignOut();
        return { ok: false, error: "This shop is suspended. Contact support." };
      }
    }

    const next = applyLocalSession(user, auth.data.id);
    setAuthReady(true);
    return { ok: true, user: next };
  },
  async logout() {
    await flushNeonSync();
    await neonSignOut();
    clearLocalSession({ flush: true });
  },
  enterShop(shopId: string): { ok: true } | { ok: false; error: string } {
    const user = getSessionUser();
    if (!user?.isPlatformAdmin) return { ok: false, error: "Only platform admin can enter shops." };
    const shop = root.shops.find((s) => s.id === shopId);
    if (!shop) return { ok: false, error: "Shop not found." };
    commitRoot({ ...root, viewingShopId: shopId });
    return { ok: true };
  },
  exitShop() {
    commitRoot({ ...root, viewingShopId: null });
  },
  setShopStatus(shopId: string, status: M.ShopStatus) {
    commitRoot({
      ...root,
      shops: root.shops.map((s) => (s.id === shopId ? { ...s, status } : s)),
    });
  },
  /** Record or update a shop's monthly platform fee for a billing month (YYYY-MM). */
  upsertPlatformFee(input: {
    shopId: string;
    month: string;
    amount: number;
    status: M.PlatformFeeStatus;
    note?: string;
  }): { ok: true } | { ok: false; error: string } {
    const admin = getSessionUser();
    if (!admin?.isPlatformAdmin) return { ok: false, error: "Only platform admin can manage fees." };
    if (!root.shops.some((s) => s.id === input.shopId)) return { ok: false, error: "Shop not found." };
    if (!/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, error: "Invalid billing month." };
    const amount = Math.max(0, Math.round(input.amount));
    const fees = root.platformFees ?? [];
    const existing = fees.find((f) => f.shopId === input.shopId && f.month === input.month);
    const nextFee: M.PlatformFee = {
      id: existing?.id ?? uid("fee"),
      shopId: input.shopId,
      month: input.month,
      amount,
      status: input.status,
      ...(input.status === "Paid"
        ? { paidAt: existing?.status === "Paid" && existing.paidAt ? existing.paidAt : now() }
        : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };
    commitRoot({
      ...root,
      platformFees: existing
        ? fees.map((f) => (f.id === existing.id ? nextFee : f))
        : [nextFee, ...fees],
    });
    return { ok: true };
  },
  setUserStatus(userId: string, status: "Active" | "Inactive") {
    commitRoot({
      ...root,
      allUsers: root.allUsers.map((u) => (u.id === userId ? { ...u, status } : u)),
    });
  },
  /** Platform admin creates a shop + owner login without switching session. */
  async createShop(input: {
    shopName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
    city?: string;
    plan?: M.ShopPlan;
    monthlyFee?: number;
    /** If set, creates the first month fee record on create. */
    initialFeeStatus?: M.PlatformFeeStatus;
    initialFeeMonth?: string;
    initialFeeNote?: string;
  }): Promise<{ ok: true; shopId: string } | { ok: false; error: string }> {
    const admin = getSessionUser();
    if (!admin?.isPlatformAdmin) return { ok: false, error: "Only platform admin can create shops." };
    if (root.allUsers.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const created = await neonAdminCreateUser({
      email: input.email,
      password: input.password,
      name: input.ownerName,
    });
    if (!created.ok) return created;

    const shopId = uid("shop");
    const userId = uid("u");
    const plan = input.plan ?? "Starter";
    const monthlyFee =
      typeof input.monthlyFee === "number" && input.monthlyFee >= 0
        ? Math.round(input.monthlyFee)
        : undefined;
    const shop: M.Shop = {
      id: shopId,
      name: input.shopName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      city: (input.city ?? "").trim(),
      status: "Active",
      plan,
      createdAt: now(),
      ...(typeof monthlyFee === "number" ? { monthlyFee } : {}),
    };
    const settings = M.defaultSettings({
      name: shop.name,
      phone: shop.phone,
      email: shop.email,
      city: shop.city,
      plan: shop.plan,
    });
    const user: M.User = {
      id: userId,
      name: input.ownerName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      role: "Owner",
      status: "Active",
      password: "",
      lastLogin: "",
      shopId,
      isPlatformAdmin: false,
      authId: created.data.id,
    };
    let platformFees = root.platformFees ?? [];
    if (input.initialFeeStatus) {
      const month = input.initialFeeMonth && /^\d{4}-\d{2}$/.test(input.initialFeeMonth)
        ? input.initialFeeMonth
        : (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          })();
      const amount = monthlyFee ?? 0;
      platformFees = [
        {
          id: uid("fee"),
          shopId,
          month,
          amount,
          status: input.initialFeeStatus,
          ...(input.initialFeeStatus === "Paid" ? { paidAt: now() } : {}),
          ...(input.initialFeeNote?.trim() ? { note: input.initialFeeNote.trim() } : {}),
        },
        ...platformFees,
      ];
    }
    commitRoot({
      ...root,
      shops: [...root.shops, shop],
      bags: { ...root.bags, [shopId]: emptyShopBag(settings) },
      allUsers: [...root.allUsers, user],
      platformFees,
    }, { flush: true });
    await flushNeonSync();
    return { ok: true, shopId };
  },
  setShopMonthlyFee(shopId: string, monthlyFee: number): { ok: true } | { ok: false; error: string } {
    const admin = getSessionUser();
    if (!admin?.isPlatformAdmin) return { ok: false, error: "Only platform admin can update fees." };
    if (!root.shops.some((s) => s.id === shopId)) return { ok: false, error: "Shop not found." };
    commitRoot({
      ...root,
      shops: root.shops.map((s) =>
        s.id === shopId ? { ...s, monthlyFee: Math.max(0, Math.round(monthlyFee)) } : s,
      ),
    });
    return { ok: true };
  },
  async signup(input: {
    shopName: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    if (root.allUsers.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const auth = await neonSignUp({
      email: input.email,
      password: input.password,
      name: input.ownerName,
    });
    if (!auth.ok) return auth;

    const shopId = uid("shop");
    const userId = uid("u");
    const shop: M.Shop = {
      id: shopId,
      name: input.shopName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      city: "",
      status: "Active",
      plan: "Starter",
      createdAt: now(),
    };
    const settings = M.defaultSettings({
      name: shop.name,
      phone: shop.phone,
      email: shop.email,
      city: shop.city,
      plan: shop.plan,
    });
    const platformAdmin = M.isPlatformAdminEmail(input.email);
    const user: M.User = {
      id: userId,
      name: input.ownerName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      role: "Owner",
      status: "Active",
      password: "",
      lastLogin: now(),
      shopId: platformAdmin ? null : shopId,
      isPlatformAdmin: platformAdmin,
      authId: auth.data.id,
    };
    commitRoot({
      ...root,
      shops: platformAdmin ? root.shops : [...root.shops, shop],
      bags: platformAdmin ? root.bags : { ...root.bags, [shopId]: emptyShopBag(settings) },
      allUsers: [...root.allUsers, user],
      sessionUserId: userId,
      viewingShopId: null,
      currentUser: user.name,
    }, { flush: true });
    await flushNeonSync();
    setAuthReady(true);
    return { ok: true };
  },
  async changePassword(
    userId: string,
    current: string,
    next: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const user = root.allUsers.find((u) => u.id === userId);
    if (!user) return { ok: false, error: "User not found." };
    const session = getSessionUser();
    if (!session || session.id !== userId) {
      return { ok: false, error: "You can only change your own password." };
    }
    const result = await neonChangePassword(current, next);
    if (!result.ok) return result;
    commitRoot({
      ...root,
      allUsers: root.allUsers.map((u) => (u.id === userId ? { ...u, password: "" } : u)),
    });
    return { ok: true };
  },
  saveStaff(st: Omit<M.Staff, "id" | "joinDate"> & { id?: string; joinDate?: string }) {
    if (st.id) {
      setState((s) => ({ staff: s.staff.map((x) => (x.id === st.id ? { ...x, ...st, id: x.id, joinDate: st.joinDate ?? x.joinDate } : x)) }));
      return st.id;
    }
    const id = uid("st");
    setState((s) => ({ staff: [{ ...st, id, joinDate: st.joinDate ?? now(), salaryType: st.salaryType ?? "Monthly", salaryCustom: st.salaryCustom ?? "", notes: st.notes ?? "", address: st.address ?? "" }, ...s.staff] }));
    return id;
  },
  deleteStaff(id: string) {
    setState((s) => ({ staff: s.staff.filter((x) => x.id !== id), staffTxns: s.staffTxns.filter((t) => t.staffId !== id) }));
  },
  recordStaffTxn(input: { staffId: string; kind: M.StaffTxnKind; amount: number; accountId: string; note?: string; forMonth?: string }) {
    const meta = payMeta(getState(), input.accountId);
    const txn: M.StaffTxn = {
      id: uid("stx"), staffId: input.staffId, date: now(), kind: input.kind, amount: input.amount,
      ...meta, note: input.note ?? "", forMonth: input.forMonth ?? currentMonthKey(),
    };
    setState((s) => ({ staffTxns: [txn, ...s.staffTxns] }));
    return txn;
  },
  addAdjustment(a: { productId: string; type: M.AdjustType; qty: number; reason: string; notes: string }) {
    const s = getState();
    const p = s.products.find((x) => x.id === a.productId);
    if (!p) return;
    const before = p.stock;
    const after = a.type === "Add" ? before + a.qty : a.type === "Correction" ? a.qty : Math.max(0, before - a.qty);
    const products = s.products.map((x) => (x.id === p.id ? { ...x, stock: after } : x));
    setState(() => ({
      products, notifications: withLowStockNotes(s.products, products, s.notifications),
      adjustments: [{ ...a, id: uid("a"), date: now(), before, after, by: s.currentUser }, ...s.adjustments],
    }));
  },
  addSaleReturn(input: { saleId: string; items: M.LineItem[]; reason: string; refund: number; accountId: string }) {
    const s = getState();
    const sale = s.sales.find((x) => x.id === input.saleId);
    if (!sale) return false;
    const priorReturns = s.saleReturns.filter((r) => r.saleId === sale.id);
    const prior = priorReturns.flatMap((r) => r.items);
    for (const it of input.items) {
      const sold = sale.items.filter((i) => i.productId === it.productId).reduce((a, b) => a + b.qty, 0);
      const already = prior.filter((i) => i.productId === it.productId).reduce((a, b) => a + b.qty, 0);
      if (it.qty <= 0 || it.qty > sold - already) return false;
    }
    const soldQty = sale.items.reduce((a, b) => a + b.qty, 0);
    const retQty = [...prior, ...input.items].reduce((a, b) => a + b.qty, 0);
    const refund = Math.min(Math.max(0, input.refund), maxSaleRefund(sale, priorReturns, input.items));
    const meta = payMeta(s, input.accountId);
    setState(() => ({
      saleReturns: [{ ...input, refund, ...meta, id: uid("sr"), no: `RET-${101 + s.saleReturns.length}`, date: now(), invoiceNo: sale.invoiceNo }, ...s.saleReturns],
      sales: s.sales.map((x) => (x.id === sale.id && retQty >= soldQty ? { ...x, status: "Returned" as const } : x)),
      products: s.products.map((p) => {
        const it = input.items.find((i) => i.productId === p.id);
        return it ? { ...p, stock: p.stock + it.qty } : p;
      }),
    }));
    return true;
  },
  addPurchaseReturn(input: { purchaseId: string; items: M.LineItem[]; reason: string; mode: "Paid" | "Unpaid" }) {
    const s = getState();
    const pur = s.purchases.find((x) => x.id === input.purchaseId);
    if (!pur || pur.status === "Returned") return;
    const purchasedQty = pur.items.reduce((a, b) => a + b.qty, 0);
    const retQty = [...s.purchaseReturns.filter((r) => r.purchaseId === pur.id).flatMap((r) => r.items), ...input.items].reduce((a, b) => a + b.qty, 0);
    const amount = sumItems(input.items);
    const fullyReturned = retQty >= purchasedQty;
    setState(() => ({
      purchaseReturns: [{ ...input, amount, id: uid("pr"), no: `PRT-${21 + s.purchaseReturns.length}`, date: now(), purchaseNo: pur.no, supplierId: pur.supplierId }, ...s.purchaseReturns],
      purchases: s.purchases.map((x) => {
        if (x.id !== pur.id) return x;
        if (fullyReturned) return { ...x, total: 0, paid: 0, status: "Returned" as const };
        const total = Math.max(0, x.total - amount);
        // Paid = refund received from supplier; Unpaid = credit against supplier balance/dues
        const paid = input.mode === "Paid" ? Math.max(0, x.paid - amount) : Math.min(x.paid, total);
        return { ...x, total, paid, status: M.statusOf(total, paid) };
      }),
      products: s.products.map((p) => {
        const it = input.items.find((i) => i.productId === p.id);
        return it ? { ...p, stock: Math.max(0, p.stock - it.qty) } : p;
      }),
    }));
  },
  holdSale(h: Omit<M.HeldSale, "id" | "date">) {
    setState((s) => ({ held: capHeld([{ ...h, id: uid("h"), date: now() }, ...s.held]) }));
  },
  removeHeld(id: string) {
    setState((s) => ({ held: s.held.filter((h) => h.id !== id) }));
  },
  markRead(id?: string) {
    setState((s) => ({ notifications: s.notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) }));
  },
  deleteNotification(id: string) {
    setState((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
  },
  updateSettings<K extends keyof M.Settings>(key: K, value: M.Settings[K]) {
    setState((s) => ({ settings: { ...s.settings, [key]: value } }));
  },
};
