import { format } from "date-fns";

export { pageHead } from "@/lib/seo";

export const rs = (n: number) => `Rs. ${Math.round(n || 0).toLocaleString("en-PK")}`;
export const fmtDate = (iso: string) => format(new Date(iso), "dd MMM yyyy");
export const fmtDateTime = (iso: string) => format(new Date(iso), "dd MMM yyyy, hh:mm a");
export const fmtTime = (iso: string) => format(new Date(iso), "hh:mm a");
export const toDateInput = (d: Date) => format(d, "yyyy-MM-dd");
export const uid = (p = "") => p + Math.random().toString(36).slice(2, 9);

/** Label for a supplier id — keeps purchase history readable after the supplier is removed. */
export function supplierName(suppliers: { id: string; name: string }[], id: string | null | undefined, whenEmpty = "—") {
  if (!id) return whenEmpty;
  return suppliers.find((s) => s.id === id)?.name ?? "Supplier deleted";
}

export function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

export type Range = { from: string; to: string };
export function inRange(iso: string, r: Range) {
  const d = format(new Date(iso), "yyyy-MM-dd");
  if (r.from && d < r.from) return false;
  if (r.to && d > r.to) return false;
  return true;
}
