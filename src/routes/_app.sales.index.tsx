import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, BadgePercent, ChartNoAxesColumn, CircleCheck, Eye, FileText, HandCoins, MoreHorizontal, Pencil, Plus, Printer, Receipt, Undo2 } from "lucide-react";
// Undo2 used for returned sales summary
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CopyableText, DataTable, DateRangePicker, EmptyState, FilterBar, PageHeader, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { downloadInvoicePdf } from "@/components/invoice-preview";
import { PaymentDialog } from "@/components/payment-dialog";
import { actions, saleDue, saleReturnedStats, useDB } from "@/lib/store";
import { fmtDateTime, inRange, pageHead, rs, type Range } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { type Sale } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/sales/")({
  head: pageHead("Sales", "All sales invoices with filters, export and returns."),
  component: SalesPage,
});

function SalesPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const [cust, setCust] = useState("all");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState<Sale | null>(null);
  const name = (id: string | null) => db.customers.find((c) => c.id === id)?.name ?? "Walk-in";
  const canEdit = (s: Sale) => s.status !== "Returned" && !db.saleReturns.some((r) => r.saleId === s.id);
  const rows = useMemo(() => db.sales.filter((s) =>
    (!q || `${s.invoiceNo} ${name(s.customerId)}`.toLowerCase().includes(q.toLowerCase())) && inRange(s.date, range) &&
    (cust === "all" || (cust === "walkin" ? !s.customerId : s.customerId === cust)) && (method === "all" || s.accountId === method) && (status === "all" || s.status === status),
  ), [db, q, range, cust, method, status]);

  const returnsBySale = useMemo(() => {
    const map = new Map<string, { qty: number; amount: number }>();
    for (const s of db.sales) {
      const ret = saleReturnedStats(s, db.saleReturns);
      if (ret.qty) map.set(s.id, ret);
    }
    return map;
  }, [db.sales, db.saleReturns]);

  const summary = useMemo(() => {
    const total = rows.reduce((a, b) => a + b.total, 0);
    const paid = rows.reduce((a, b) => a + b.paid, 0);
    const dueAmt = rows.reduce((a, b) => a + saleDue(b, db.saleReturns), 0);
    const discount = rows.reduce((a, b) => a + b.discount, 0);
    let returnedQty = 0;
    let returnedAmt = 0;
    for (const s of rows) {
      const ret = returnsBySale.get(s.id);
      if (!ret) continue;
      returnedQty += ret.qty;
      returnedAmt += ret.amount;
    }
    return {
      total,
      paid,
      due: dueAmt,
      discount,
      returnedQty,
      returnedAmt,
      net: total - returnedAmt,
    };
  }, [rows, returnsBySale, db.saleReturns]);

  const cols: Column<Sale>[] = [
    { key: "inv", header: "Invoice #", cell: (s) => <CopyableText value={s.invoiceNo} /> },
    { key: "date", header: "Date", cell: (s) => (
      <div className="whitespace-nowrap text-sm">
        <p>{fmtDateTime(s.date)}</p>
        {s.editedAt && <p className="text-xs text-muted-foreground">Edited {fmtDateTime(s.editedAt)}</p>}
      </div>
    ) },
    { key: "cust", header: "Customer", cell: (s) => name(s.customerId) },
    { key: "items", header: "Items", cell: (s) => s.items.reduce((a, b) => a + b.qty, 0), className: "text-center" },
    {
      key: "returned",
      header: "Returned",
      cell: (s) => {
        const ret = returnsBySale.get(s.id);
        if (!ret?.qty) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="text-right">
            <p className="font-medium text-warning">{ret.qty} pcs</p>
            <p className="text-xs text-muted-foreground">{rs(ret.amount)}</p>
          </div>
        );
      },
      className: "text-right",
    },
    { key: "total", header: "Total", cell: (s) => <b>{rs(s.subtotal)}</b>, className: "text-right" },
    { key: "discount", header: "Discount", cell: (s) => (
      <span className={s.discount > 0 ? "font-medium text-warning" : "text-muted-foreground"}>
        {s.discount > 0 ? `-${rs(s.discount)}` : rs(0)}
      </span>
    ), className: "text-right" },
    {
      key: "net",
      header: "Net",
      cell: (s) => {
        const ret = returnsBySale.get(s.id)?.amount ?? 0;
        return <b>{rs(s.total - ret)}</b>;
      },
      className: "text-right",
    },
    { key: "paid", header: "Paid", cell: (s) => rs(s.paid), className: "text-right" },
    { key: "due", header: "Due", cell: (s) => { const d = saleDue(s, db.saleReturns); return <span className={d ? "font-medium text-destructive" : ""}>{rs(d)}</span>; }, className: "text-right" },
    { key: "method", header: "Payment", cell: (s) => s.method },
    {
      key: "status", header: "Status", cell: (s) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={s.status} />
          {(s.status === "Unpaid" || s.status === "Partial") && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPay(s)}>
              <HandCoins className="size-3.5" />Paid
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "actions", header: "", className: "w-10", cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate({ to: "/sales/$id", params: { id: s.id } })}><Eye className="size-4" />View invoice</DropdownMenuItem>
            <DropdownMenuItem disabled={!canEdit(s)} onClick={() => navigate({ to: "/pos", search: { edit: s.id } })}><Pencil className="size-4" />Edit sale</DropdownMenuItem>
            {(s.status === "Unpaid" || s.status === "Partial") && (
              <DropdownMenuItem onClick={() => setPay(s)}><HandCoins className="size-4" />Receive payment</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate({ to: "/sales/$id", params: { id: s.id }, search: { print: true } })}><Printer className="size-4" />Print</DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadInvoicePdf(s, db.settings, name(s.customerId))}><FileText className="size-4" />Download PDF</DropdownMenuItem>
            <DropdownMenuItem disabled={s.status === "Returned"} onClick={() => navigate({ to: "/sale-returns", search: { invoice: s.invoiceNo } })}><Undo2 className="size-4" />Return sale</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "sales.pdf",
      title: "Sales",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "inv", header: "Invoice #", width: 26 },
        { key: "date", header: "Date", width: 32 },
        { key: "cust", header: "Customer", width: 34 },
        { key: "returned", header: "Returned", align: "right", width: 22 },
        { key: "total", header: "Total", align: "right", width: 22 },
        { key: "discount", header: "Discount", align: "right", width: 20 },
        { key: "net", header: "Net", align: "right", width: 22 },
        { key: "paid", header: "Paid", align: "right", width: 22 },
        { key: "due", header: "Due", align: "right", width: 22 },
        { key: "method", header: "Payment", width: 20 },
        { key: "status", header: "Status", width: 20 },
      ],
      rows: rows.map((s) => {
        const ret = returnsBySale.get(s.id);
        return {
          inv: s.invoiceNo,
          date: fmtDateTime(s.date),
          cust: name(s.customerId),
          returned: ret?.qty ? `${ret.qty} · ${rs(ret.amount)}` : "—",
          total: rs(s.subtotal),
          discount: s.discount > 0 ? `-${rs(s.discount)}` : rs(0),
          net: rs(s.total - (ret?.amount ?? 0)),
          paid: rs(s.paid),
          due: rs(saleDue(s, db.saleReturns)),
          method: s.method,
          status: s.status,
        };
      }),
      summary: [
        { label: "Invoices", value: String(rows.length) },
        { label: "Total Sale", value: rs(summary.total) },
        { label: "Returned", value: `${summary.returnedQty} pcs · ${rs(summary.returnedAmt)}` },
        { label: "Net (Sale − Returned)", value: rs(summary.net) },
        { label: "Discount", value: rs(summary.discount) },
        { label: "Paid", value: rs(summary.paid) },
        { label: "Due", value: rs(summary.due) },
      ],
    });
  };

  return (
    <div>
      <PageHeader
        title="Sales"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Sale" value={rs(summary.total)} icon={Receipt} tone="info" compact />
            <StatCard
              label="Returned"
              value={rs(summary.returnedAmt)}
              hint={`${summary.returnedQty} pcs`}
              icon={Undo2}
              tone={summary.returnedAmt ? "warning" : "default"}
              compact
            />
            <StatCard
              label="Net Sale"
              value={rs(summary.net)}
              hint="Sale − Returned"
              icon={ChartNoAxesColumn}
              tone="success"
              compact
            />
            <StatCard label="Discount" value={rs(summary.discount)} icon={BadgePercent} tone={summary.discount ? "warning" : "default"} compact />
            <StatCard label="Paid" value={rs(summary.paid)} icon={CircleCheck} tone="success" compact />
            <StatCard label="Due" value={rs(summary.due)} icon={AlertCircle} tone={summary.due ? "warning" : "default"} compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search invoice or customer" className="sm:w-64" />
          <DateRangePicker value={range} onChange={setRange} />
          <SearchableSelect
            value={cust}
            onChange={setCust}
            className="sm:w-44"
            placeholder="All customers"
            options={[{ value: "all", label: "All customers" }, { value: "walkin", label: "Walk-in" }, ...db.customers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SearchableSelect
            value={method}
            onChange={setMethod}
            className="sm:w-40"
            placeholder="All payments"
            options={[{ value: "all", label: "All payments" }, ...db.accounts.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <SearchableSelect
            value={status}
            onChange={setStatus}
            className="sm:w-36"
            placeholder="All status"
            options={[{ value: "all", label: "All status" }, "Paid", "Partial", "Unpaid", "Returned"]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button asChild><Link to="/pos"><Plus className="size-4" />New Sale</Link></Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={(s) => navigate({ to: "/sales/$id", params: { id: s.id } })}
          rowClassName={(s) => saleDue(s, db.saleReturns) > 0 ? "bg-warning/10 hover:bg-warning/15" : undefined}
          empty={<EmptyState icon={Receipt} title="No sales recorded yet." description="Try changing the filters, or make your first sale from POS." action={<Button asChild><Link to="/pos">Open POS</Link></Button>} />}
        />
      </Card>
      {pay && (
        <PaymentDialog
          open={!!pay}
          onOpenChange={(o) => !o && setPay(null)}
          title={`Receive payment · ${pay.invoiceNo}`}
          due={saleDue(pay, db.saleReturns)}
          onSubmit={(a, m) => actions.recordSalePayment(pay.id, a, m)}
        />
      )}
    </div>
  );
}
