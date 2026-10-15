import { format } from "date-fns";

export const PRODUCT_UNITS = ["Piece", "Pack", "Box"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_GENDERS = ["Boy", "Girl", "Unisex"] as const;
export type ProductGender = (typeof PRODUCT_GENDERS)[number] | "";

export const SIZE_PRESETS = [
  "NB", "0-3M", "3-6M", "6-12M", "12-18M", "18-24M", "2-3Y", "3-4Y", "4-5Y",
  "S", "M", "L", "XL", "XXL", "Free",
] as const;

/** Warn while this many days of shelf life remain, including today. */
export const EXPIRY_SOON_DAYS = 30;

export type ExpiryState = "none" | "ok" | "soon" | "expired";

type AttrFields = {
  size?: string;
  gender?: string;
  color?: string;
  expiryDate?: string;
  unit?: string;
};

export function normalizeProduct<T extends AttrFields>(p: T): T & {
  size: string;
  gender: ProductGender;
  color: string;
  expiryDate: string;
  unit: ProductUnit;
} {
  const gender = (PRODUCT_GENDERS as readonly string[]).includes(p.gender ?? "")
    ? (p.gender as ProductGender)
    : "";
  const unit = (PRODUCT_UNITS as readonly string[]).includes(p.unit ?? "")
    ? (p.unit as ProductUnit)
    : "Piece";
  const expiryDate = typeof p.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.expiryDate) ? p.expiryDate : "";
  return {
    ...p,
    size: (p.size ?? "").trim(),
    gender,
    color: (p.color ?? "").trim(),
    expiryDate,
    unit,
  };
}

export function productVariantLabel(p: { size?: string; gender?: string; color?: string }) {
  return [p.size, p.gender, p.color].map((s) => s?.trim()).filter(Boolean).join(" · ");
}

export function productSearchText(p: {
  name: string;
  sku: string;
  barcode?: string;
  brand: string;
  size?: string;
  gender?: string;
  color?: string;
}) {
  return `${p.name} ${p.sku} ${p.barcode ?? ""} ${p.brand} ${p.size ?? ""} ${p.gender ?? ""} ${p.color ?? ""}`;
}

export function unitWord(unit: ProductUnit = "Piece", qty = 2) {
  if (unit === "Pack") return qty === 1 ? "pack" : "packs";
  if (unit === "Box") return qty === 1 ? "box" : "boxes";
  return qty === 1 ? "pc" : "pcs";
}

export function qtyWithUnit(qty: number, unit: ProductUnit = "Piece") {
  return `${qty} ${unitWord(unit, qty)}`;
}

function dateKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDateKey(key: string) {
  const parts = key.split("-");
  const y = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return dateKey(new Date());
}

export function addDaysKey(key: string, days: number) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Shelf-life state from a YYYY-MM-DD string. Ignores stock. */
export function expiryStatus(expiryDate?: string): ExpiryState {
  if (!expiryDate) return "none";
  const today = todayKey();
  if (expiryDate < today) return "expired";
  if (expiryDate <= addDaysKey(today, EXPIRY_SOON_DAYS)) return "soon";
  return "ok";
}

export function daysUntilExpiry(expiryDate?: string): number | null {
  if (!expiryDate) return null;
  const today = parseDateKey(todayKey());
  const target = parseDateKey(expiryDate);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function fmtExpiry(expiryDate: string) {
  return format(parseDateKey(expiryDate), "dd MMM yyyy");
}

export function expiryPhrase(expiryDate?: string) {
  const days = daysUntilExpiry(expiryDate);
  if (days == null) return "";
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "Expired yesterday" : `Expired ${n} days ago`;
  }
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

export function expiryBadge(status: ExpiryState): "Expired" | "Expiring soon" | null {
  if (status === "expired") return "Expired";
  if (status === "soon") return "Expiring soon";
  return null;
}

/** In-stock products that are expired or inside the 30-day window, soonest first. */
export function productsAtRisk<T extends { expiryDate?: string; stock: number }>(products: T[]) {
  return products
    .filter((p) => p.stock > 0 && (expiryStatus(p.expiryDate) === "expired" || expiryStatus(p.expiryDate) === "soon"))
    .slice()
    .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""));
}
