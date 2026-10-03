import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, FileText, HandCoins, MoreHorizontal, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CurrencyInput,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  SearchInput,
  SimpleSelect,
  StatCard,
  StatusBadge,
  type Column,
} from "@/components/shared";
import { actions, usePlatform } from "@/lib/store";
import { fmtDateTime, pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { formatMonthLabel, shopMonthlyFee } from "@/lib/plans";
import type { PlatformFeeStatus, Shop } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/fees")({
  head: pageHead("Fees", "Each shop’s fee details — selected, received, pending."),
  component: AdminFees,
});

type ShopFeeRow = {
  shop: Shop;
  shopId: string;
  shopName: string;
  ownerName: string;
  selected: number;
  received: number;
  pending: number;
  months: number;
};

type MonthFeeRow = {
  month: string;
  selected: number;
  received: number;
  pending: number;
  status: "Paid" | "Pending" | "Partial";
  paidAt?: string;
  note?: string;
};

function AdminFees() {
  const platform = usePlatform();
  const [q, setQ] = useState("");
  const [detailShopId, setDetailShopId] = useState<string | null>(null);

  const [feeOpen, setFeeOpen] = useState(false);
  const [feeMonth, setFeeMonth] = useState("");
  const [feeAmount, setFeeAmount] = useState(0);
  const [feeStatus, setFeeStatus] = useState<PlatformFeeStatus>("Paid");
  const [feeNote, setFeeNote] = useState("");
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [monthlyAmount, setMonthlyAmount] = useState(0);

  const ownerOf = (shopId: string) => {
    const users = platform.users.filter((u) => u.shopId === shopId);
    return users.find((u) => u.role === "Owner") ?? users[0] ?? null;
  };

  const shopRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list: ShopFeeRow[] = platform.shops.map((shop) => {
      const selected = shopMonthlyFee(shop);
      const fees = platform.platformFees.filter((f) => f.shopId === shop.id);
      let received = 0;
      let pending = 0;
      for (const fee of fees) {
        const got = fee.status === "Paid" ? fee.amount : 0;
        received += got;
        pending += Math.max(0, selected - got);
      }
      const owner = ownerOf(shop.id);
      return {
        shop,
        shopId: shop.id,
        shopName: shop.name,
        ownerName: owner?.name ?? "—",
        selected,
        received,
        pending,
        months: fees.length,
      };
    });
    return list.filter((r) => {
      if (!query) return true;
      return `${r.shopName} ${r.ownerName}`.toLowerCase().includes(query);
    });
  }, [platform.shops, platform.users, platform.platformFees, q]);

  const overview = useMemo(() => {
    const selectedSum = shopRows.reduce((a, r) => a + r.selected, 0);
    const received = shopRows.reduce((a, r) => a + r.received, 0);
    const pending = shopRows.reduce((a, r) => a + r.pending, 0);
    return { selectedSum, received, pending, shops: shopRows.length };
  }, [shopRows]);

  const detailShop = detailShopId
    ? platform.shops.find((s) => s.id === detailShopId) ?? null
    : null;
  const detailOwner = detailShop ? ownerOf(detailShop.id) : null;

  const monthRows = useMemo(() => {
    if (!detailShop) return [] as MonthFeeRow[];
    const selected = shopMonthlyFee(detailShop);
    return platform.platformFees
      .filter((f) => f.shopId === detailShop.id)
      .map((fee) => {
        const received = fee.status === "Paid" ? fee.amount : 0;
        const pending = Math.max(0, selected - received);
        const status: MonthFeeRow["status"] =
          received <= 0 ? "Pending" : received >= selected ? "Paid" : "Partial";
        return {
          month: fee.month,
          selected,
          received,
          pending,
          status,
          paidAt: fee.paidAt,
          note: fee.note,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [detailShop, platform.platformFees]);

  const detailSummary = useMemo(() => {
    const selected = detailShop ? shopMonthlyFee(detailShop) : 0;
    return {
      selected,
      received: monthRows.reduce((a, r) => a + r.received, 0),
      pending: monthRows.reduce((a, r) => a + r.pending, 0),
      months: monthRows.length,
      pendingMonths: monthRows.filter((r) => r.pending > 0).length,
    };
  }, [detailShop, monthRows]);

  const openShopFees = (shopId: string) => setDetailShopId(shopId);

  const openAddFee = (row?: MonthFeeRow) => {
    if (!detailShop) return;
    const decided = shopMonthlyFee(detailShop);
    setFeeMonth(row?.month ?? "");
    setFeeAmount(row ? row.received || decided : decided);
    setFeeStatus(row && row.received <= 0 ? "Pending" : "Paid");
    setFeeNote(row?.note ?? "");
    setFeeOpen(true);
  };

  const saveFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailShop) return;
    if (!/^\d{4}-\d{2}$/.test(feeMonth)) {
      toast.error("Select a month from the calendar.");
      return;
    }
    const received = feeStatus === "Pending" ? 0 : feeAmount;
    const res = actions.upsertPlatformFee({
      shopId: detailShop.id,
      month: feeMonth,
      amount: received,
      status: received > 0 ? "Paid" : "Pending",
      note: feeNote,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const decided = shopMonthlyFee(detailShop);
    toast.success(
      received > 0
        ? `${formatMonthLabel(feeMonth)} — received ${rs(received)}, pending ${rs(Math.max(0, decided - received))}.`
        : `${formatMonthLabel(feeMonth)} marked pending — ${rs(decided)}.`,
    );
    setFeeOpen(false);
  };

  const openMonthly = () => {
    if (!detailShop) return;
    setMonthlyAmount(shopMonthlyFee(detailShop));
    setMonthlyOpen(true);
  };

  const saveMonthly = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailShop) return;
    const res = actions.setShopMonthlyFee(detailShop.id, monthlyAmount);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Monthly fee set to ${rs(monthlyAmount)}.`);
    setMonthlyOpen(false);
  };

  const downloadMonthPdf = (r: MonthFeeRow) => {
    if (!detailShop) return;
    exportTablePdf({
      filename: `${detailShop.name.replace(/\s+/g, "-").toLowerCase()}-${r.month}-fee.pdf`,
      title: "Monthly fee receipt",
      shopName: "shoponclick Admin",
      subtitle: `${detailShop.name}${detailOwner ? ` · Owner: ${detailOwner.name}` : ""}`,
      columns: [
        { key: "label", header: "Detail", width: 50 },
        { key: "value", header: "Value", width: 70 },
      ],
      rows: [
        { label: "Month", value: formatMonthLabel(r.month) },
        { label: "Selected (monthly fee)", value: rs(r.selected) },
        { label: "Received", value: rs(r.received) },
        { label: "Pending", value: rs(r.pending) },
        { label: "Status", value: r.status },
        { label: "Paid on", value: r.paidAt ? fmtDateTime(r.paidAt) : "—" },
        { label: "Note", value: r.note || "—" },
      ],
      summary: [
        { label: "Shop", value: detailShop.name },
        { label: "Month", value: formatMonthLabel(r.month) },
        { label: "Pending", value: rs(r.pending) },
      ],
    });
  };

  const downloadAllPdf = () => {
    if (!detailShop || !monthRows.length) {
      toast.error("No fee months to export. Add a fee first.");
      return;
    }
    exportTablePdf({
      filename: `${detailShop.name.replace(/\s+/g, "-").toLowerCase()}-fees.pdf`,
      title: "Shop fee statement",
      shopName: "shoponclick Admin",
      subtitle: `${detailShop.name}${detailOwner ? ` · Owner: ${detailOwner.name}` : ""}`,
      columns: [
        { key: "month", header: "Month", width: 35 },
        { key: "selected", header: "Selected", align: "right", width: 28 },
        { key: "received", header: "Received", align: "right", width: 28 },
        { key: "pending", header: "Pending", align: "right", width: 28 },
        { key: "status", header: "Status", width: 22 },
        { key: "paidAt", header: "Paid on", width: 35 },
      ],
      rows: monthRows.map((r) => ({
        month: formatMonthLabel(r.month),
        selected: rs(r.selected),
        received: rs(r.received),
        pending: rs(r.pending),
        status: r.status,
        paidAt: r.paidAt ? fmtDateTime(r.paidAt) : "—",
      })),
      summary: [
        { label: "Selected monthly fee", value: rs(detailSummary.selected) },
        { label: "Received", value: rs(detailSummary.received) },
        { label: "Pending", value: rs(detailSummary.pending) },
      ],
    });
  };

  const shopCols: Column<ShopFeeRow>[] = [
    {
      key: "shop",
      header: "Shop",
      cell: (r) => (
        <div>
          <p className="font-medium hover:underline">{r.shopName}</p>
          <p className="text-xs text-muted-foreground">Owner: {r.ownerName}</p>
        </div>
      ),
    },
    {
      key: "selected",
      header: "Selected",
      className: "text-right",
      cell: (r) => <span className="font-semibold tabular-nums">{rs(r.selected)}</span>,
    },
    {
      key: "received",
      header: "Received",
      className: "text-right",
      cell: (r) => (
        <span className={`font-semibold tabular-nums ${r.received > 0 ? "text-success" : "text-muted-foreground"}`}>
          {rs(r.received)}
        </span>
      ),
    },
    {
      key: "pending",
      header: "Pending",
      className: "text-right",
      cell: (r) => (
        <span className={`font-semibold tabular-nums ${r.pending > 0 ? "text-warning" : "text-muted-foreground"}`}>
          {rs(r.pending)}
        </span>
      ),
    },
    {
      key: "months",
      header: "Months",
      cell: (r) => <span className="text-muted-foreground">{r.months}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openShopFees(r.shopId)}>View fee details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const monthCols: Column<MonthFeeRow>[] = [
    {
      key: "month",
      header: "Month",
      cell: (r) => <span className="font-medium">{formatMonthLabel(r.month)}</span>,
    },
    {
      key: "selected",
      header: "Selected",
      className: "text-right",
      cell: (r) => <span className="font-semibold tabular-nums">{rs(r.selected)}</span>,
    },
    {
      key: "received",
      header: "Received",
      className: "text-right",
      cell: (r) => (
        <span className={`font-semibold tabular-nums ${r.received > 0 ? "text-success" : "text-muted-foreground"}`}>
          {rs(r.received)}
        </span>
      ),
    },
    {
      key: "pending",
      header: "Pending",
      className: "text-right",
      cell: (r) => (
        <span className={`font-semibold tabular-nums ${r.pending > 0 ? "text-warning" : "text-muted-foreground"}`}>
          {rs(r.pending)}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "paidAt",
      header: "Paid on",
      cell: (r) =>
        r.paidAt ? (
          <span className="text-muted-foreground">{fmtDateTime(r.paidAt)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "pdf",
      header: "PDF",
      className: "w-16",
      cell: (r) => (
        <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => downloadMonthPdf(r)}>
          <FileText className="size-3.5" />
          PDF
        </Button>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openAddFee(r)}>
              {r.pending > 0 ? "Record payment" : "Edit payment"}
            </DropdownMenuItem>
            {r.received > 0 && (
              <DropdownMenuItem
                onClick={() => {
                  setFeeMonth(r.month);
                  setFeeAmount(0);
                  setFeeStatus("Pending");
                  setFeeNote(r.note ?? "");
                  setFeeOpen(true);
                }}
              >
                Mark pending
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees"
        description="Har shop ki fee details yahan. Shop pe click karke month-wise selected / received / pending dekho."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shops" value={overview.shops} icon={Wallet} tone="info" />
        <StatCard label="Selected (monthly rates)" value={rs(overview.selectedSum)} hint="Sum of decided monthly fees" icon={HandCoins} tone="info" />
        <StatCard label="Received" value={rs(overview.received)} icon={HandCoins} tone="success" />
        <StatCard label="Pending" value={rs(overview.pending)} icon={HandCoins} tone="warning" />
      </div>

      <Card>
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search shop or owner…" className="sm:w-72" />
        </FilterBar>
        <DataTable
          columns={shopCols}
          rows={shopRows}
          rowKey={(r) => r.shopId}
          onRowClick={(r) => openShopFees(r.shopId)}
          empty={
            <EmptyState
              icon={CheckCircle2}
              title="No shops yet"
              description="Create a shop first, then manage its fees here."
            />
          }
        />
      </Card>

      <Dialog open={!!detailShop} onOpenChange={(o) => !o && setDetailShopId(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          {detailShop && (
            <>
              <DialogHeader className="border-b px-6 py-4">
                <DialogTitle>{detailShop.name} — fee details</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Owner: {detailOwner?.name ?? "—"} · Selected monthly fee {rs(detailSummary.selected)}
                </p>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">Selected fees (monthly)</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{rs(detailSummary.selected)}</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">Received</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-success">{rs(detailSummary.received)}</p>
                  </div>
                  <div className="rounded-lg border px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground">Pending</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-warning">{rs(detailSummary.pending)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={openMonthly}>Edit monthly fee</Button>
                  <Button variant="outline" size="sm" onClick={downloadAllPdf}>
                    <FileText className="size-4" />
                    All PDF
                  </Button>
                  <Button size="sm" onClick={() => openAddFee()}>
                    <Plus className="size-4" />
                    Add fee
                  </Button>
                </div>

                <Card className="overflow-hidden shadow-none">
                  <DataTable
                    columns={monthCols}
                    rows={monthRows}
                    rowKey={(r) => r.month}
                    empty={
                      <EmptyState
                        icon={HandCoins}
                        title="No fees added yet"
                        description="Add fee aur calendar se month select karo."
                        action={
                          <Button size="sm" onClick={() => openAddFee()}>
                            <Plus className="size-4" />
                            Add fee
                          </Button>
                        }
                      />
                    }
                  />
                </Card>
              </div>

              <DialogFooter className="border-t px-6 py-3">
                <Button variant="outline" onClick={() => setDetailShopId(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add / update fee</DialogTitle>
          </DialogHeader>
          {detailShop && (
            <form onSubmit={saveFee} className="space-y-4">
              <Field label="Select month">
                <Input
                  type="month"
                  value={feeMonth}
                  onChange={(e) => setFeeMonth(e.target.value)}
                  className="bg-card"
                  required
                />
              </Field>
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Selected monthly fee: </span>
                <span className="font-semibold tabular-nums">{rs(shopMonthlyFee(detailShop))}</span>
              </div>
              <Field label="Status">
                <SimpleSelect
                  value={feeStatus}
                  onChange={(v) => setFeeStatus(v as PlatformFeeStatus)}
                  options={[
                    { value: "Paid", label: "Received / paid" },
                    { value: "Pending", label: "Pending (nothing received)" },
                  ]}
                />
              </Field>
              {feeStatus === "Paid" && (
                <Field label="Received amount (Rs.)">
                  <CurrencyInput value={feeAmount} onChange={setFeeAmount} autoFocus />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pending = selected − received ({rs(Math.max(0, shopMonthlyFee(detailShop) - feeAmount))}).
                  </p>
                </Field>
              )}
              <Field label="Note (optional)">
                <Textarea
                  rows={2}
                  placeholder="e.g. JazzCash / bank transfer ref"
                  value={feeNote}
                  onChange={(e) => setFeeNote(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFeeOpen(false)}>Cancel</Button>
                <Button type="submit">Save fee</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={monthlyOpen} onOpenChange={setMonthlyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Monthly fee</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveMonthly} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Yeh decided monthly fee hai — Selected column isi se aati hai.
            </p>
            <Field label="Amount (Rs.)">
              <CurrencyInput value={monthlyAmount} onChange={setMonthlyAmount} autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMonthlyOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
