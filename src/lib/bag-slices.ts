/**
 * A shop bag is one in-memory object, but disk and Neon store it as slices.
 * A sale rewrites sales + stock, not purchases and not product photos.
 */

import type { Product } from "./mock-data";

/** Loose bag shape so this module does not import persist.ts. */
export type SliceBag = {
  products: unknown[];
  notifications: unknown[];
  held: unknown[];
  accountBalanceLogs: unknown[];
  [key: string]: unknown;
};

export const BAG_SLICES = ["catalogue", "sales", "ledger"] as const;
export type BagSlice = (typeof BAG_SLICES)[number];
/** Photos are not part of the text slices — they sync only when a picture changes. */
export type SyncSlice = BagSlice | "images";

export type ShopImages = Record<string, string>;
export type ShopCounts = { products: number; sales: number; customers: number };

export type BagParts = Record<BagSlice, SliceBag>;

/**
 * undefined slices = write every slice.
 * empty slices = session / shops / users only, no bag body.
 */
export type SaveScope = {
  slices?: SyncSlice[];
  shopId?: string;
};

const SLICE_KEYS: Record<BagSlice, readonly string[]> = {
  catalogue: [
    "products",
    "categories",
    "customers",
    "suppliers",
    "accounts",
    "accountBalanceLogs",
    "staff",
    "staffTxns",
    "notifications",
    "settings",
    "rolePermissions",
  ],
  sales: ["sales", "saleReturns", "held", "nextInvoice"],
  ledger: ["purchases", "purchaseReturns", "adjustments", "expenses", "nextPurchase"],
};

const KEY_SLICE: Record<string, BagSlice> = {};
for (const slice of BAG_SLICES) {
  for (const key of SLICE_KEYS[slice]) KEY_SLICE[key] = slice;
}

export function unionSaveScope(prev: SaveScope | undefined, next: SaveScope | undefined): SaveScope | undefined {
  if (!prev) return next;
  if (!next) return prev;
  if (prev.slices === undefined || next.slices === undefined) return {};
  const slices = [...new Set([...prev.slices, ...next.slices])];
  const ids = [prev.shopId, next.shopId].filter((id): id is string => !!id);
  const unique = [...new Set(ids)];
  const shopId = unique[0];
  if (unique.length === 1 && shopId) return { slices, shopId };
  return { slices };
}

export function bagCounts(bag: { products?: unknown; sales?: unknown; customers?: unknown } | undefined): ShopCounts {
  const len = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    products: len(bag?.products),
    sales: len(bag?.sales),
    customers: len(bag?.customers),
  };
}

export function splitBag(bag: SliceBag): { slices: BagParts; images: ShopImages } {
  const slices = {} as BagParts;
  for (const slice of BAG_SLICES) {
    const part = {} as SliceBag;
    for (const key of SLICE_KEYS[slice]) {
      if (key in bag) part[key] = bag[key];
    }
    slices[slice] = part;
  }

  const images: ShopImages = {};
  const products = Array.isArray(slices.catalogue.products) ? (slices.catalogue.products as Product[]) : [];
  slices.catalogue.products = products.map((product) => {
    if (product.image) images[product.id] = product.image;
    if (!product.image) return product;
    const { image: _image, ...rest } = product;
    return rest;
  });
  return { slices, images };
}

export function joinBag(parts: Partial<BagParts>, images?: ShopImages): SliceBag {
  const bag: SliceBag = {
    products: [],
    notifications: [],
    held: [],
    accountBalanceLogs: [],
  };
  for (const slice of BAG_SLICES) {
    const part = parts[slice];
    if (!part || typeof part !== "object") continue;
    Object.assign(bag, part);
  }
  if (images && Array.isArray(bag.products)) {
    bag.products = (bag.products as Product[]).map((product) => {
      const image = images[product.id];
      if (!image || product.image) return product;
      return { ...product, image };
    });
  }
  return bag;
}

export function sliceHasBody(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0;
}

function imagesChanged(prev: { id: string; image?: string }[] | undefined, next: { id: string; image?: string }[]): boolean {
  const prevMap = new Map((prev ?? []).map((product) => [product.id, product.image ?? ""]));
  const nextIds = new Set<string>();
  for (const product of next) {
    nextIds.add(product.id);
    if ((prevMap.get(product.id) ?? "") !== (product.image ?? "")) return true;
  }
  for (const [id, image] of prevMap) {
    if (image && !nextIds.has(id)) return true;
  }
  return false;
}

/** Which slices a state patch actually dirties. Stock edits do not dirty photos. */
export function dirtySlices(
  prevProducts: { id: string; image?: string }[] | undefined,
  patch: Record<string, unknown>,
): SyncSlice[] {
  const out = new Set<SyncSlice>();
  for (const key of Object.keys(patch)) {
    const slice = KEY_SLICE[key];
    if (slice) out.add(slice);
  }
  const products = patch["products"];
  if (Array.isArray(products) && imagesChanged(prevProducts, products as { id: string; image?: string }[])) {
    out.add("images");
  }
  return [...out];
}
