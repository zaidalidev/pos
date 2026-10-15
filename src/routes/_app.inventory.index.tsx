import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Boxes, CalendarClock, ChevronLeft, ChevronRight, FileText, History, MoreHorizontal, PackageX, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, EmptyState, FilterBar, PageHeader, ProductThumb, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { stockStatus, useDB } from "@/lib/store";
import { fmtDateTime, pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import type { Product } from "@/lib/mock-data";
import { productSearchText, productVariantLabel, productsAtRisk, qtyWithUnit } from "@/lib/product-attrs";

export const Route = createFileRoute("/_app/inventory/")({
  head: pageHead("Stock", "Current stock, valuation, and movement history."),
  component: StockPage,
});

const HISTORY_PAGE_SIZE = 10;

type Movement = { id: string; date: string; kind: string; detail: string; change: number };

function movementsFor(productId: string, db: ReturnType<typeof useDB>): Movement[] {
  const rows: Movement[] = [];
  for (const a of db.adjustments) {
    if (a.productId !== productId) continue;
    rows.push({ id: a.id, date: a.date, kind: a.type, detail: a.reason || "Stock adjustment", change: a.after - a.before });
  }
  for (const s of db.sales) {
    for (const it of s.items) {
      if (it.productId !== productId) continue;
      rows.push({ id: `${s.id}-${it.productId}`, date: s.date, kind: "Sale", detail: s.invoiceNo, change: -it.qty });
    }
  }
  for (const p of db.purchases) {
    for (const it of p.items) {
      if (it.productId !== productId) continue;
      rows.push({ id: `${p.id}-${it.productId}`, date: p.date, kind: "Purchase", detail: p.no, change: it.qty });
    }
  }
  for (const r of db.saleReturns) {
    for (const it of r.items) {
      if (it.productId !== productId) continue;
      rows.push({ id: `${r.id}-${it.productId}`, date: r.date, kind: "Sale return", detail: r.invoiceNo, change: it.qty });
    }
  }
  for (const r of db.purchaseReturns) {
    for (const it of r.items) {
      if (it.productId !== productId) continue;
      rows.push({ id: `${r.id}-${it.productId}`, date: r.date, kind: "Purchase return", detail: r.purchaseNo, change: -it.qty });
    }
  }
  return rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

function StockPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [history, setHistory] = useState<Product | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  useEffect(() => setHistoryPage(0), [history?.id]);

  const rows = useMemo(
    () =>
      db.products.filter(
        (p) =>
          (!q || productSearchText(p).toLowerCase().includes(q.toLowerCase())) &&
          (status === "all" || stockStatus(p) === status),
      ),
    [db.products, q, status],
  );

  const summary = useMemo(() => {
    const totalStock = db.products.reduce((a, p) => a + p.stock, 0);
    const stockValue = db.products.reduce((a, p) => a + p.stock * p.purchasePrice, 0);
    const low = db.products.filter((p) => stockStatus(p) === "Low Stock").length;
    const out = db.products.filter((p) => stockStatus(p) === "Out of Stock").length;
    return { totalStock, stockValue, low, out };
  }, [db.products]);

  const historyRows = useMemo(() => (history ? movementsFor(history.id, db) : []), [history, db]);
  const historyPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPages - 1);
  const historyView = historyRows.slice(safeHistoryPage * HISTORY_PAGE_SIZE, safeHistoryPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);

  const cols: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={p} />
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{[p.brand, productVariantLabel(p)].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "sku", header: "SKU", cell: (p) => <span className="font-mono text-xs">{p.sku}</span> },
    { key: "stock", header: "Current Stock", cell: (p) => <span className={p.stock <= p.minStock ? "font-semibold text-warning" : ""}>{qtyWithUnit(p.stock, p.unit)}</span>, className: "text-center" },
    { key: "pp", header: "Purchase Price", cell: (p) => rs(p.purchasePrice), className: "text-right", mobileHidden: true },
    { key: "sp", header: "Sale Price", cell: (p) => rs(p.salePrice), className: "text-right", mobileHidden: true },
    { key: "value", header: "Stock Value", cell: (p) => <b>{rs(p.stock * p.purchasePrice)}</b>, className: "text-right" },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={stockStatus(p)} /> },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate({ to: "/inventory/adjustments", search: { product: p.id } })}><SlidersHorizontal className="size-4" />Adjust stock</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHistory(p)}><History className="size-4" />Stock history</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "stock.pdf",
      title: "Stock",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "name", header: "Product", width: 55 },
        { key: "sku", header: "SKU", width: 28 },
        { key: "stock", header: "Stock", align: "right", width: 18 },
        { key: "pp", header: "Purchase", align: "right", width: 26 },
        { key: "sp", header: "Sale", align: "right", width: 26 },
        { key: "value", header: "Value", align: "right", width: 28 },
        { key: "status", header: "Status", width: 28 },
      ],
      rows: rows.map((p) => ({
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        pp: rs(p.purchasePrice),
        sp: rs(p.salePrice),
        value: rs(p.stock * p.purchasePrice),
        status: stockStatus(p),
      })),
      summary: [
        { label: "Total stock", value: String(summary.totalStock) },
        { label: "Stock value", value: rs(summary.stockValue) },
        { label: "Low stock", value: String(summary.low) },
        { label: "Out of stock", value: String(summary.out) },
      ],
    });
  };

  return (
    <div>
      <PageHeader
        title="Stock"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Total stock" value={summary.totalStock} icon={Boxes} compact />
            <StatCard label="Stock value" value={rs(summary.stockValue)} icon={Banknote} tone="info" compact />
            <StatCard label="Low stock" value={summary.low} icon={TriangleAlert} tone="warning" compact />
            <StatCard label="Out of stock" value={summary.out} icon={PackageX} tone="destructive" compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, SKU or barcode" className="sm:w-72" />
          <SearchableSelect
            value={status}
            onChange={setStatus}
            className="sm:w-40"
            placeholder="All stock"
            options={[
              { value: "all", label: "All stock" },
              { value: "In Stock", label: "In Stock" },
              { value: "Low Stock", label: "Low Stock" },
              { value: "Out of Stock", label: "Out of Stock" },
            ]}
          />
          <Button asChild variant="outline"><Link to="/inventory/expiring"><CalendarClock className="size-4" />Expiring ({productsAtRisk(db.products).length})</Link></Button>
          <Button variant="outline" onClick={doPdf} className="sm:ml-auto"><FileText className="size-4" />PDF</Button>
        </FilterBar>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(p) => p.id}
          loading={loading}
          pageSize={12}
          onRowClick={(p) => setHistory(p)}
          empty={<EmptyState icon={Boxes} title="No products match your filters." description="Try a different search or stock status." />}
        />
      </Card>
      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          {history && (
            <>
              <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 pr-12 text-left">
                <DialogTitle className="flex items-center gap-2">
                  <span className="truncate">{history.name}</span>
                  <StatusBadge status={stockStatus(history)} />
                </DialogTitle>
                <DialogDescription>
                  {history.sku || "No SKU"} · {history.stock} in stock · {rs(history.stock * history.purchasePrice)}
                </DialogDescription>
              </DialogHeader>

              {historyRows.length ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="divide-y">
                      {historyView.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">{m.kind}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {m.detail} · {fmtDateTime(m.date)}
                            </p>
                          </div>
                          <span
                            className={
                              m.change > 0
                                ? "shrink-0 tabular-nums text-sm font-semibold text-success"
                                : m.change < 0
                                  ? "shrink-0 tabular-nums text-sm font-semibold text-destructive"
                                  : "shrink-0 tabular-nums text-sm font-semibold text-muted-foreground"
                            }
                          >
                            {m.change > 0 ? `+${m.change}` : m.change}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {historyPages > 1 && (
                    <div className="flex shrink-0 items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
                      <span>
                        Showing {safeHistoryPage * HISTORY_PAGE_SIZE + 1}–{Math.min(historyRows.length, (safeHistoryPage + 1) * HISTORY_PAGE_SIZE)} of {historyRows.length}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="icon" className="size-8" disabled={safeHistoryPage === 0} onClick={() => setHistoryPage(safeHistoryPage - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                        <Button variant="outline" size="icon" className="size-8" disabled={safeHistoryPage >= historyPages - 1} onClick={() => setHistoryPage(safeHistoryPage + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState icon={History} title="No stock movement yet." description="Sales, purchases, and adjustments for this product will show up here." />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
