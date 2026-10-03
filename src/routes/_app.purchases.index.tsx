import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Boxes, CircleCheck, Eye, FileText, HandCoins, MoreHorizontal, Pencil, Plus, ShoppingBag, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CopyableText, DataTable, DateRangePicker, EmptyState, FilterBar, PageHeader, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { PaymentDialog } from "@/components/payment-dialog";
import { actions, due, useDB } from "@/lib/store";
import { fmtDateTime, inRange, pageHead, rs, supplierName, type Range } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import type { Purchase } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/purchases/")({
  head: pageHead("Purchases", "Stock purchases from suppliers with payments and dues."),
  component: PurchasesPage,
});

function PurchasesPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const [supplier, setSupplier] = useState("all");
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState<Purchase | null>(null);
  const [view, setView] = useState<Purchase | null>(null);
  const supName = (id: string) => supplierName(db.suppliers, id);
  const canEdit = (p: Purchase) => p.status !== "Returned" && !db.purchaseReturns.some((r) => r.purchaseId === p.id);
  const purchasedAmt = (p: Purchase) => Math.max(0, p.subtotal - p.discount);
  const returnedAmt = (p: Purchase) =>
    db.purchaseReturns.filter((r) => r.purchaseId === p.id).reduce((a, r) => a + r.amount, 0);
  const returnedQty = (p: Purchase) =>
    db.purchaseReturns
      .filter((r) => r.purchaseId === p.id)
      .reduce((a, r) => a + r.items.reduce((x, i) => x + i.qty, 0), 0);

  const rows = useMemo(() => db.purchases.filter((p) =>
    (!q || `${p.no} ${supName(p.supplierId)}`.toLowerCase().includes(q.toLowerCase())) &&
    inRange(p.date, range) &&
    (supplier === "all" || p.supplierId === supplier) &&
    (status === "all" || p.status === status),
  ), [db, q, range, supplier, status]);

  const summary = useMemo(() => {
    const purchaseIds = new Set(rows.map((p) => p.id));
    let returnedQty = 0;
    let returnedAmt = 0;
    for (const r of db.purchaseReturns) {
      if (!purchaseIds.has(r.purchaseId)) continue;
      returnedQty += r.items.reduce((a, i) => a + i.qty, 0);
      returnedAmt += r.amount;
    }
    return {
      total: rows.reduce((a, b) => a + b.total, 0),
      paid: rows.reduce((a, b) => a + b.paid, 0),
      due: rows.reduce((a, b) => a + due(b), 0),
      items: rows.reduce((a, b) => a + b.items.reduce((x, y) => x + y.qty, 0), 0),
      returnedQty,
      returnedAmt,
    };
  }, [rows, db.purchaseReturns]);

  const cols: Column<Purchase>[] = [
    { key: "no", header: "Purchase #", cell: (p) => <CopyableText value={p.no} /> },
    { key: "date", header: "Date", cell: (p) => (
      <div className="whitespace-nowrap text-sm">
        <p>{fmtDateTime(p.date)}</p>
        {p.editedAt && <p className="text-xs text-muted-foreground">Edited {fmtDateTime(p.editedAt)}</p>}
      </div>
    ) },
    { key: "sup", header: "Supplier", cell: (p) => supName(p.supplierId) },
    { key: "items", header: "Items", cell: (p) => p.items.reduce((a, b) => a + b.qty, 0), className: "text-center" },
    {
      key: "returned",
      header: "Returned",
      cell: (p) => {
        const qty = returnedQty(p);
        if (!qty) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="text-right">
            <p className="font-medium text-warning">{qty} pcs</p>
            <p className="text-xs text-muted-foreground">{rs(returnedAmt(p))}</p>
          </div>
        );
      },
      className: "text-right",
    },
    { key: "total", header: "Total", cell: (p) => {
      const ret = returnedAmt(p);
      const qty = returnedQty(p);
      const bought = purchasedAmt(p);
      if (ret <= 0) return <b>{rs(p.total)}</b>;
      return (
        <div className="text-right">
          <b>{rs(p.total)}</b>
          <p className="text-xs font-normal text-muted-foreground">Purchased {rs(bought)}</p>
          <p className="text-xs font-normal text-muted-foreground">Returned {qty} pcs · {rs(ret)}</p>
        </div>
      );
    }, className: "text-right" },
    { key: "paid", header: "Paid", cell: (p) => rs(p.paid), className: "text-right" },
    { key: "due", header: "Due", cell: (p) => <span className={due(p) ? "font-medium text-destructive" : ""}>{rs(due(p))}</span>, className: "text-right" },
    {
      key: "status", header: "Status", cell: (p) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={p.status} />
          {(p.status === "Unpaid" || p.status === "Partial") && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPay(p)}>
              <HandCoins className="size-3.5" />Pay
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "actions", header: "", className: "w-10", cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => setView(p)}><Eye className="size-4" />View purchase</DropdownMenuItem>
            <DropdownMenuItem disabled={!canEdit(p)} onClick={() => navigate({ to: "/purchases/new", search: { edit: p.id } })}><Pencil className="size-4" />Edit purchase</DropdownMenuItem>
            {(p.status === "Unpaid" || p.status === "Partial") && (
              <DropdownMenuItem onClick={() => setPay(p)}><HandCoins className="size-4" />Record payment</DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={p.status === "Returned"} onClick={() => navigate({ to: "/purchase-returns" })}><Undo2 className="size-4" />Return purchase</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "purchases.pdf",
      title: "Purchases",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "no", header: "Purchase #", width: 28 },
        { key: "date", header: "Date", width: 36 },
        { key: "sup", header: "Supplier", width: 40 },
        { key: "items", header: "Items", align: "right", width: 18 },
        { key: "returned", header: "Returned", align: "right", width: 28 },
        { key: "total", header: "Total", align: "right", width: 36 },
        { key: "paid", header: "Paid", align: "right", width: 24 },
        { key: "due", header: "Due", align: "right", width: 24 },
        { key: "status", header: "Status", width: 22 },
      ],
      rows: rows.map((p) => ({
        no: p.no,
        date: fmtDateTime(p.date),
        sup: supName(p.supplierId),
        items: String(p.items.reduce((a, b) => a + b.qty, 0)),
        returned: returnedQty(p) ? `${returnedQty(p)} pcs · ${rs(returnedAmt(p))}` : "—",
        total: returnedAmt(p) > 0 ? `${rs(p.total)} (returned ${returnedQty(p)} pcs)` : rs(p.total),
        paid: rs(p.paid),
        due: rs(due(p)),
        status: p.status,
      })),
      summary: [
        { label: "Purchases", value: String(rows.length) },
        { label: "Items", value: String(summary.items) },
        { label: "Total", value: rs(summary.total) },
        { label: "Purchase Return Qty", value: `${summary.returnedQty} pcs · ${rs(summary.returnedAmt)}` },
        { label: "Paid", value: rs(summary.paid) },
        { label: "Due", value: rs(summary.due) },
      ],
    });
  };

  return (
    <div>
      <PageHeader
        title="Purchases"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Purchases" value={rs(summary.total)} icon={ShoppingBag} tone="info" compact />
            <StatCard
              label="Purchase Return Qty"
              value={`${summary.returnedQty} pcs`}
              hint={rs(summary.returnedAmt)}
              icon={Undo2}
              tone={summary.returnedQty ? "warning" : "default"}
              compact
            />
            <StatCard label="Paid" value={rs(summary.paid)} icon={CircleCheck} tone="success" compact />
            <StatCard label="Due" value={rs(summary.due)} icon={AlertCircle} tone={summary.due ? "warning" : "default"} compact />
            <StatCard label="Total Items" value={String(summary.items)} icon={Boxes} tone="default" compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search purchase or supplier" className="sm:w-64" />
          <DateRangePicker value={range} onChange={setRange} />
          <SearchableSelect
            value={supplier}
            onChange={setSupplier}
            className="sm:w-44"
            placeholder="All suppliers"
            options={[{ value: "all", label: "All suppliers" }, ...db.suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <SearchableSelect
            value={status}
            onChange={setStatus}
            className="sm:w-36"
            placeholder="All status"
            options={[{ value: "all", label: "All status" }, { value: "Paid", label: "Paid" }, { value: "Partial", label: "Partial" }, { value: "Unpaid", label: "Unpaid" }, { value: "Returned", label: "Returned" }]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button asChild><Link to="/purchases/new" search={{}}><Plus className="size-4" />Create Purchase</Link></Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={(p) => setView(p)}
          rowClassName={(p) => due(p) > 0 ? "bg-warning/10 hover:bg-warning/15" : undefined}
          empty={<EmptyState icon={ShoppingBag} title="No purchases yet." description="Create a purchase to restock inventory from a supplier." action={<Button asChild><Link to="/purchases/new" search={{}}><Plus className="size-4" />Create Purchase</Link></Button>} />}
        />
      </Card>

      {pay && (
        <PaymentDialog
          open={!!pay}
          onOpenChange={(o) => !o && setPay(null)}
          title={`Record payment · ${pay.no}`}
          due={due(pay)}
          onSubmit={(a, m) => actions.recordPurchasePayment(pay.id, a, m)}
        />
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-lg">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{view.no}<StatusBadge status={view.status} /></DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground">Date</p><p className="font-medium">{fmtDateTime(view.date)}</p></div>
                  <div><p className="text-muted-foreground">Supplier</p><p className="font-medium">{supName(view.supplierId)}</p></div>
                  {view.editedAt && (
                    <div className="col-span-2"><p className="text-muted-foreground">Last edited</p><p className="font-medium">{fmtDateTime(view.editedAt)}</p></div>
                  )}
                </div>
                <Card className="gap-0 overflow-hidden py-0 shadow-none">
                  <CardHeader className="border-b py-2"><CardTitle className="text-sm">Items</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {view.items.map((i) => {
                          const retQty = db.purchaseReturns
                            .filter((r) => r.purchaseId === view.id)
                            .flatMap((r) => r.items)
                            .filter((x) => x.productId === i.productId)
                            .reduce((a, b) => a + b.qty, 0);
                          return (
                            <TableRow key={i.productId}>
                              <TableCell>
                                <p>{i.name}</p>
                                {retQty > 0 && (
                                  <p className="text-xs text-muted-foreground">Purchased {i.qty} · Returned {retQty}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{i.qty}</TableCell>
                              <TableCell className="text-right">{rs(i.price)}</TableCell>
                              <TableCell className="text-right">{rs(i.qty * i.price)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <div className="space-y-1 border-t pt-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rs(view.subtotal)}</span></div>
                  {view.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{rs(view.discount)}</span></div>}
                  <div className="flex justify-between font-semibold"><span>Purchased</span><span>{rs(purchasedAmt(view))}</span></div>
                  {returnedAmt(view) > 0 && (
                    <div className="flex justify-between text-muted-foreground"><span>Returned</span><span>-{rs(returnedAmt(view))}</span></div>
                  )}
                  <div className="flex justify-between font-semibold"><span>Net total</span><span>{rs(view.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{rs(view.paid)}</span></div>
                  <div className="flex justify-between font-semibold text-destructive"><span>Due</span><span>{rs(due(view))}</span></div>
                </div>
                {db.purchaseReturns.filter((r) => r.purchaseId === view.id).length > 0 && (
                  <Card className="gap-0 overflow-hidden py-0 shadow-none">
                    <CardHeader className="border-b py-2"><CardTitle className="text-sm">Returns</CardTitle></CardHeader>
                    <CardContent className="divide-y p-0">
                      {db.purchaseReturns.filter((r) => r.purchaseId === view.id).map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium">{r.no} · {r.mode}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtDateTime(r.date)} · {r.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                            </p>
                            {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                          </div>
                          <span className="shrink-0 font-semibold">{rs(r.amount)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {view.notes && <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">{view.notes}</p>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canEdit(view) && (
                    <Button variant="outline" className="flex-1" onClick={() => { setView(null); navigate({ to: "/purchases/new", search: { edit: view.id } }); }}>
                      <Pencil className="size-4" />Edit purchase
                    </Button>
                  )}
                  {due(view) > 0 && (
                    <Button className="flex-1" onClick={() => { setPay(view); setView(null); }}>
                      <HandCoins className="size-4" />Record payment
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
