import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { FileText, Package, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, EmptyState, Field, FilterBar, PageHeader, SearchableSelect, SimpleSelect, StatCard, StatusBadge, type Column } from "@/components/shared";
import { actions, getState, purchaseReturnRefund, useDB } from "@/lib/store";
import { fmtDate, pageHead, rs, supplierName } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { accountIdOf, type Purchase, type PurchaseReturn } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/purchase-returns")({
  validateSearch: z.object({ purchase: z.string().optional() }),
  head: pageHead("Purchase Returns", "Return purchased stock to suppliers and adjust balances."),
  component: PurchaseReturns,
});

const REASONS = ["Damaged in transit", "Wrong item received", "Defective product", "Overstocked", "Other"];
const MODES = ["Paid", "Unpaid"] as const;

function normalizePurchaseNo(raw: string) {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  if (/^\d+$/.test(t)) return `PUR-${t}`;
  return t;
}

function findPurchaseByNo(raw: string): Purchase | undefined {
  const { purchases } = getState();
  const key = normalizePurchaseNo(raw);
  if (!key) return undefined;
  return (
    purchases.find((x) => x.no.toUpperCase() === key) ??
    purchases.find((x) => x.no.toUpperCase().endsWith(key.replace(/^[A-Z]+-/, ""))) ??
    purchases.find((x) => x.no.toUpperCase().includes(key))
  );
}

function PurchaseReturns() {
  const db = useDB();
  const { purchase: purchaseParam } = Route.useSearch();
  const [q, setQ] = useState(purchaseParam ?? "");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState(REASONS[0]!);
  const [customReasons, setCustomReasons] = useState<string[]>([]);
  const [mode, setMode] = useState<(typeof MODES)[number]>("Paid");
  const [accountId, setAccountId] = useState(accountIdOf("Cash"));
  const reasonOptions = [...REASONS, ...customReasons.filter((r) => !REASONS.includes(r))];
  const purchase = db.purchases.find((p) => p.id === purchaseId);
  const cashAccounts = db.accounts.filter((a) => a.active && a.type !== "Credit");
  const purchaseReturnsForOpen = purchase
    ? db.purchaseReturns.filter((r) => r.purchaseId === purchase.id)
    : [];
  const alreadyReturnedAmt = purchaseReturnsForOpen.reduce((a, r) => a + r.amount, 0);
  const purchasedAmt = purchase ? Math.max(0, purchase.subtotal - purchase.discount) : 0;

  const find = (v = q) => {
    const p = findPurchaseByNo(v);
    if (!p) {
      toast.error("Purchase not found. Check the number, e.g. PUR-504.");
      setPurchaseId(null);
      setQty({});
      return;
    }
    if (p.status === "Returned") {
      toast.error(`${p.no} is already fully returned.`);
      setPurchaseId(null);
      setQty({});
      return;
    }
    setQ(p.no);
    setPurchaseId(p.id);
    setQty({});
    const lastPay = [...p.payments].reverse().find((pay) => pay.accountId && db.accounts.some((a) => a.id === pay.accountId && a.type !== "Credit"));
    setAccountId(lastPay?.accountId ?? cashAccounts[0]?.id ?? accountIdOf("Cash"));
    toast.success(`Loaded ${p.no} · ${p.items.length} item${p.items.length === 1 ? "" : "s"} · ${rs(p.total)}`);
  };

  useEffect(() => {
    if (purchaseParam) find(purchaseParam);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const returned = (pid: string) =>
    db.purchaseReturns
      .filter((r) => r.purchaseId === purchaseId)
      .flatMap((r) => r.items)
      .filter((i) => i.productId === pid)
      .reduce((a, b) => a + b.qty, 0);

  const amount = purchase ? purchase.items.reduce((a, i) => a + (qty[i.productId] ?? 0) * i.price, 0) : 0;
  const maxCashBack = purchase && mode === "Paid" ? Math.min(amount, Math.max(0, purchase.paid)) : 0;

  const submit = () => {
    if (!purchase) return;
    const items = purchase.items.filter((i) => (qty[i.productId] ?? 0) > 0).map((i) => ({ ...i, qty: qty[i.productId]! }));
    if (!items.length) return toast.error("Select at least one product to return.");
    if (!reason.trim()) return toast.error("Enter a return reason.");
    for (const it of items) {
      const product = db.products.find((p) => p.id === it.productId);
      if (!product || product.stock < it.qty) {
        return toast.error(`Not enough stock to return ${it.name}. Only ${product?.stock ?? 0} available.`);
      }
    }
    const cashBack = mode === "Paid" ? Math.min(amount, Math.max(0, purchase.paid)) : 0;
    actions.addPurchaseReturn({ purchaseId: purchase.id, items, reason, mode, accountId: mode === "Paid" ? accountId : undefined });
    toast.success(
      mode === "Paid"
        ? cashBack > 0
          ? `Return saved. ${rs(cashBack)} refunded to account. Stock updated.`
          : `Return saved. No account refund (purchase was unpaid). Stock updated.`
        : `Return saved. ${rs(amount)} unpaid — adjusted on supplier balance. Stock updated.`,
    );
    setPurchaseId(null);
    setQ("");
    setQty({});
    setReason(REASONS[0]!);
  };

  const historyQty = db.purchaseReturns.reduce((a, r) => a + r.items.reduce((x, i) => x + i.qty, 0), 0);
  const historyAmt = db.purchaseReturns.reduce((a, r) => a + r.amount, 0);

  const cols: Column<PurchaseReturn>[] = [
    { key: "no", header: "Return #", cell: (r) => <b>{r.no}</b> },
    { key: "date", header: "Date", cell: (r) => fmtDate(r.date) },
    { key: "pur", header: "Purchase #", cell: (r) => r.purchaseNo },
    {
      key: "supplier",
      header: "Supplier",
      cell: (r) => supplierName(db.suppliers, r.supplierId),
    },
    { key: "items", header: "Items", cell: (r) => r.items.map((i) => `${i.name} ×${i.qty}`).join(", ") },
    {
      key: "summary",
      header: "Purchase / Return",
      cell: (r) => {
        const pur = db.purchases.find((p) => p.id === r.purchaseId);
        const bought = pur ? Math.max(0, pur.subtotal - pur.discount) : 0;
        const allRet = db.purchaseReturns
          .filter((x) => x.purchaseId === r.purchaseId)
          .reduce((a, x) => a + x.amount, 0);
        return (
          <div className="text-sm">
            <p>Purchased {rs(bought)}</p>
            <p className="text-muted-foreground">Returned {rs(allRet)}</p>
          </div>
        );
      },
    },
    { key: "reason", header: "Reason", cell: (r) => r.reason },
    { key: "mode", header: "Amount", cell: (r) => <StatusBadge status={r.mode} /> },
    {
      key: "amt",
      header: "Total",
      cell: (r) => {
        const refund = purchaseReturnRefund(r);
        return (
          <div className="text-right">
            <b>{rs(r.amount)}</b>
            {r.mode === "Paid" && (
              <p className="text-xs font-normal text-muted-foreground">
                {refund > 0 ? `Account +${rs(refund)}` : "No account credit"}
              </p>
            )}
          </div>
        );
      },
      className: "text-right",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Returns"
        description="Return stock to suppliers and mark the amount as paid or unpaid."
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard
              label="Purchase Return Qty"
              value={`${historyQty} pcs`}
              hint={rs(historyAmt)}
              icon={Package}
              tone={historyQty ? "warning" : "default"}
              compact
            />
            <StatCard label="Return Amount" value={rs(historyAmt)} icon={Undo2} tone={historyAmt ? "warning" : "default"} compact />
            <StatCard label="Returns" value={db.purchaseReturns.length} icon={FileText} compact />
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">1. Find the purchase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                find();
              }}
            >
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (purchaseId) setPurchaseId(null);
                }}
                placeholder="Enter purchase number e.g. PUR-504"
                className="bg-card"
              />
              <Button type="submit">
                <Search className="size-4" />
                Search
              </Button>
            </form>
            {!purchase ? (
              <EmptyState
                icon={Undo2}
                title="Search a purchase to start a return."
                description="Type a purchase number and press Search to load purchased items."
              />
            ) : (
              <div className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-4 py-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <b>{purchase.no}</b>
                      <StatusBadge status={purchase.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(purchase.date)} · {supplierName(db.suppliers, purchase.supplierId)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{rs(purchasedAmt)}</p>
                    <p className="text-xs text-muted-foreground">
                      Purchased {rs(purchasedAmt)}
                      {alreadyReturnedAmt > 0 ? ` · Returned ${rs(alreadyReturnedAmt)}` : ""}
                      {amount > 0 ? ` · Returning ${rs(amount)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {purchase.items.length} item{purchase.items.length === 1 ? "" : "s"} · Paid {rs(purchase.paid)}
                    </p>
                  </div>
                </div>
                {purchase.items.map((i) => {
                  const already = returned(i.productId);
                  const max = i.qty - already;
                  const retQty = qty[i.productId] ?? 0;
                  const on = retQty > 0;
                  return (
                    <div key={i.productId} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                      <Checkbox
                        checked={on}
                        disabled={max <= 0}
                        onCheckedChange={(c) => setQty({ ...qty, [i.productId]: c ? Math.min(1, max) : 0 })}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">{i.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Purchased {i.qty} × {rs(i.price)}
                          {already > 0 && ` · Returned ${already}`}
                          {retQty > 0 && ` · Returning ${retQty}`}
                          {max <= 0 && " · Fully returned"}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={max}
                        disabled={max <= 0}
                        value={retQty}
                        onChange={(e) => {
                          const raw = Math.max(0, Number(e.target.value) || 0);
                          if (raw > max) {
                            toast.error(
                              `${i.name}: purchased ${i.qty}${already > 0 ? ` · already returned ${already}` : ""} · max return ${max}.`,
                            );
                          }
                          setQty({ ...qty, [i.productId]: Math.min(max, raw) });
                        }}
                        className="w-20"
                        aria-label="Return quantity"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle className="text-base">2. Return details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Return reason">
              <SearchableSelect
                value={reason}
                onChange={setReason}
                options={reasonOptions}
                placeholder="Select or add a reason"
                emptyText="No matching reason."
                onCreate={(label) => {
                  setCustomReasons((prev) => (prev.some((r) => r.toLowerCase() === label.toLowerCase()) ? prev : [...prev, label]));
                  setReason(label);
                }}
              />
            </Field>
            <Field label="Amount status">
              <SimpleSelect value={mode} onChange={(v) => setMode(v as (typeof MODES)[number])} options={[...MODES]} />
            </Field>
            <Field label="Amount">
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 font-semibold">{rs(amount)}</div>
            </Field>
            {mode === "Paid" && (
              <Field
                label="Refund account"
                hint={
                  purchase
                    ? maxCashBack > 0
                      ? `${rs(maxCashBack)} will be credited (limited to amount paid on this purchase).`
                      : "Purchase has no paid amount — account balance will not change."
                    : undefined
                }
              >
                <SimpleSelect
                  value={accountId}
                  onChange={setAccountId}
                  options={cashAccounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Field>
            )}
            <p className="text-xs text-muted-foreground">
              {mode === "Paid"
                ? "Supplier refunded you — money is credited to the refund account and purchase paid is reduced."
                : "Amount is unpaid — credited against supplier dues / balance. No account credit."}
            </p>
            <Button className="w-full" disabled={!purchase} onClick={submit}>
              <Undo2 className="size-4" />
              Submit return
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <span className="px-1 font-semibold">Return history</span>
          <Button
            variant="outline"
            className="sm:ml-auto"
            onClick={() => {
              exportTablePdf({
                filename: "purchase-returns.pdf",
                title: "Purchase Returns",
                shopName: db.settings.shop.name,
                orientation: "landscape",
                columns: [
                  { key: "no", header: "Return #", width: 24 },
                  { key: "date", header: "Date", width: 28 },
                  { key: "pur", header: "Purchase #", width: 28 },
                  { key: "supplier", header: "Supplier", width: 40 },
                  { key: "items", header: "Items", width: 60 },
                  { key: "reason", header: "Reason", width: 32 },
                  { key: "mode", header: "Status", width: 24 },
                  { key: "amt", header: "Amount", align: "right", width: 28 },
                ],
                rows: db.purchaseReturns.map((r) => ({
                  no: r.no,
                  date: fmtDate(r.date),
                  pur: r.purchaseNo,
                  supplier: supplierName(db.suppliers, r.supplierId),
                  items: r.items.map((i) => `${i.name} ×${i.qty}`).join(", "),
                  reason: r.reason,
                  mode: r.mode,
                  amt: rs(r.amount),
                })),
                summary: [{ label: "Total returned", value: rs(db.purchaseReturns.reduce((a, r) => a + r.amount, 0)) }],
              });
            }}
          >
            <FileText className="size-4" />
            PDF
          </Button>
        </FilterBar>
        <DataTable
          columns={cols}
          rows={db.purchaseReturns}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No purchase returns yet." />}
        />
      </Card>
    </div>
  );
}
