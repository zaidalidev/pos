import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Banknote, Boxes, FileText, Hash, Package, PackagePlus, PackageMinus, Printer, Receipt, ShoppingBag, SlidersHorizontal, TriangleAlert, Wrench } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DataTable, EmptyState, FilterBar, PageHeader, ProductThumb, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column,
} from "@/components/shared";
import {
  adjustmentRows, allStockMovements, filterProducts, inventoryReportMeta, isInventoryReportSlug, soldByProduct,
  type AdjustmentRow, type InventoryReportSlug, type SoldQtyRow, type StockMovementRow,
} from "@/lib/inventory-reports";
import { stockStatus, useDB } from "@/lib/store";
import { fmtDateTime, inRange, pageHead, rs, toDateInput, type Range } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { categoryLabel, matchesCategory, parentCategories } from "@/lib/mock-data";
import { productSearchText } from "@/lib/product-attrs";

export const Route = createFileRoute("/_app/reports/inventory/$report")({
  beforeLoad: ({ params }) => {
    if (!isInventoryReportSlug(params.report)) throw notFound();
  },
  head: ({ params }) => {
    const meta = inventoryReportMeta(params.report);
    return pageHead(meta?.name ?? "Inventory Report", meta?.description ?? "Inventory report.")();
  },
  component: InventoryReportPage,
});

function monthRange(): Range {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function InventoryReportPage() {
  const { report: reportParam } = Route.useParams();
  const report = reportParam as InventoryReportSlug;
  const meta = inventoryReportMeta(report)!;
  const db = useDB();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [range, setRange] = useState<Range>(monthRange());

  const catName = (id: string) => categoryLabel(db.categories, id);
  const matchQ = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase());

  const sold = useMemo(() => {
    const fromMs = range.from ? +new Date(range.from) : undefined;
    const toMs = range.to ? +new Date(range.to + "T23:59:59") : undefined;
    return soldByProduct(db, fromMs, toMs);
  }, [db, range]);

  const productRows = useMemo(() => {
    return filterProducts(report, db.products, sold).filter((p) => {
      if (!matchesCategory(db.categories, p.categoryId, category)) return false;
      return matchQ(productSearchText(p));
    });
  }, [report, db.products, db.categories, sold, category, q]);

  const movements = useMemo(() => {
    if (report !== "stock-movement") return [] as StockMovementRow[];
    return allStockMovements(db).filter((m) => {
      if (!inRange(m.date, range)) return false;
      if (category !== "all") {
        const p = db.products.find((x) => x.id === m.productId);
        if (!p || !matchesCategory(db.categories, p.categoryId, category)) return false;
      }
      return matchQ(`${m.productName} ${m.sku} ${m.kind} ${m.detail}`);
    });
  }, [report, db, range, category, q]);

  const adjustments = useMemo(() => {
    if (report !== "stock-adjustment-history") return [] as AdjustmentRow[];
    return adjustmentRows(db).filter((a) => {
      if (!inRange(a.date, range)) return false;
      if (category !== "all") {
        const p = db.products.find((x) => x.id === a.productId);
        if (!p || !matchesCategory(db.categories, p.categoryId, category)) return false;
      }
      return matchQ(`${a.productName} ${a.sku} ${a.type} ${a.reason} ${a.by}`);
    });
  }, [report, db, range, category, q]);

  const summary = useMemo(() => {
    if (report === "stock-movement") {
      const inQty = movements.filter((m) => m.change > 0).reduce((a, m) => a + m.change, 0);
      const outQty = movements.filter((m) => m.change < 0).reduce((a, m) => a + Math.abs(m.change), 0);
      return [
        { label: "Movements", value: movements.length },
        { label: "Stock In", value: inQty },
        { label: "Stock Out", value: outQty },
        { label: "Net Change", value: inQty - outQty },
      ];
    }
    if (report === "stock-adjustment-history") {
      return [
        { label: "Adjustments", value: adjustments.length },
        { label: "Added", value: adjustments.filter((a) => a.type === "Add").length },
        { label: "Removed / Damage / Lost", value: adjustments.filter((a) => a.type !== "Add" && a.type !== "Correction").length },
        { label: "Corrections", value: adjustments.filter((a) => a.type === "Correction").length },
      ];
    }
    const list = productRows;
    const stockValue = list.reduce((a, p) => a + p.stock * p.purchasePrice, 0);
    const saleValue = list.reduce((a, p) => a + p.stock * p.salePrice, 0);
    const totalStock = list.reduce((a, p) => a + p.stock, 0);
    const soldQty = list.reduce((a, p) => a + (p.soldQty ?? 0), 0);
    if (report === "stock-valuation") {
      return [
        { label: "Products", value: list.length },
        { label: "Total Qty", value: totalStock },
        { label: "Cost Value", value: rs(stockValue) },
        { label: "Sale Value", value: rs(saleValue) },
      ];
    }
    if (report === "fast-moving" || report === "slow-moving" || report === "dead-stock") {
      return [
        { label: "Products", value: list.length },
        { label: "Qty Sold", value: soldQty },
        { label: "On Hand", value: totalStock },
        { label: "Stock Value", value: rs(stockValue) },
      ];
    }
    return [
      { label: "Products", value: list.length },
      { label: "Total Qty", value: totalStock },
      { label: "Stock Value", value: rs(stockValue) },
      { label: "Low / Out", value: `${list.filter((p) => stockStatus(p) === "Low Stock").length} / ${list.filter((p) => stockStatus(p) === "Out of Stock").length}` },
    ];
  }, [report, productRows, movements, adjustments]);

  const summaryIcons: Record<string, ComponentType<{ className?: string }>> = {
    Movements: SlidersHorizontal,
    "Stock In": ArrowDownToLine,
    "Stock Out": ArrowUpFromLine,
    "Net Change": Hash,
    Adjustments: Wrench,
    Added: PackagePlus,
    "Removed / Damage / Lost": PackageMinus,
    Corrections: Wrench,
    Products: Boxes,
    "Total Qty": Package,
    "Cost Value": Banknote,
    "Sale Value": Receipt,
    "Qty Sold": ShoppingBag,
    "On Hand": Package,
    "Stock Value": Banknote,
    "Low / Out": TriangleAlert,
  };

  const showVelocity = report === "fast-moving" || report === "slow-moving" || report === "dead-stock";
  const showRange = report === "stock-movement" || report === "stock-adjustment-history" || showVelocity;

  const productCols: Column<SoldQtyRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-2">
          <ProductThumb product={p} className="size-8" />
          <span className="min-w-0 truncate font-medium">{p.name}</span>
        </div>
      ),
    },
    { key: "sku", header: "SKU", cell: (p) => <span className="font-mono text-xs">{p.sku}</span> },
    ...(report === "product-wise-stock"
      ? ([
          { key: "brand", header: "Brand", cell: (p) => p.brand },
          { key: "cat", header: "Category", cell: (p) => catName(p.categoryId) },
        ] satisfies Column<SoldQtyRow>[])
      : []),
    { key: "stock", header: "Stock", cell: (p) => p.stock, className: "text-right" },
    ...(report === "stock-valuation" || report === "product-wise-stock" || report === "current-stock"
      ? ([
          { key: "pp", header: "Purchase", cell: (p) => rs(p.purchasePrice), className: "text-right" },
          { key: "sp", header: "Sale", cell: (p) => rs(p.salePrice), className: "text-right" },
          { key: "val", header: "Stock Value", cell: (p) => <b>{rs(p.stock * p.purchasePrice)}</b>, className: "text-right" },
        ] satisfies Column<SoldQtyRow>[])
      : ([{ key: "val", header: "Stock Value", cell: (p) => <b>{rs(p.stock * p.purchasePrice)}</b>, className: "text-right" }] satisfies Column<SoldQtyRow>[])),
    ...(showVelocity
      ? ([
          { key: "sold", header: "Qty Sold", cell: (p) => p.soldQty, className: "text-right" },
          { key: "soldVal", header: "Sold Value", cell: (p) => rs(p.soldValue), className: "text-right" },
        ] satisfies Column<SoldQtyRow>[])
      : []),
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={stockStatus(p)} /> },
  ];

  const movementCols: Column<StockMovementRow>[] = [
    { key: "date", header: "Date", cell: (m) => <span className="whitespace-nowrap text-sm">{fmtDateTime(m.date)}</span> },
    { key: "product", header: "Product", cell: (m) => <span className="font-medium">{m.productName}</span> },
    { key: "sku", header: "SKU", cell: (m) => <span className="font-mono text-xs">{m.sku}</span> },
    { key: "kind", header: "Type", cell: (m) => m.kind },
    { key: "detail", header: "Reference", cell: (m) => m.detail },
    {
      key: "change",
      header: "Change",
      cell: (m) => <span className={m.change >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive"}>{m.change >= 0 ? `+${m.change}` : m.change}</span>,
      className: "text-right",
    },
  ];

  const adjustmentCols: Column<AdjustmentRow>[] = [
    { key: "date", header: "Date", cell: (a) => <span className="whitespace-nowrap text-sm">{fmtDateTime(a.date)}</span> },
    { key: "product", header: "Product", cell: (a) => <span className="font-medium">{a.productName}</span> },
    { key: "sku", header: "SKU", cell: (a) => <span className="font-mono text-xs">{a.sku}</span> },
    { key: "type", header: "Type", cell: (a) => <StatusBadge status={a.type} /> },
    { key: "qty", header: "Qty", cell: (a) => a.qty, className: "text-right" },
    { key: "before", header: "Before", cell: (a) => a.before, className: "text-right" },
    { key: "after", header: "After", cell: (a) => a.after, className: "text-right" },
    { key: "reason", header: "Reason", cell: (a) => a.reason || "—" },
    { key: "by", header: "By", cell: (a) => a.by },
  ];

  const doPdf = () => {
    if (report === "stock-movement") {
      exportTablePdf({
        filename: "stock-movement.pdf",
        title: meta.name,
        shopName: db.settings.shop.name,
        orientation: "landscape",
        columns: [
          { key: "date", header: "Date", width: 36 },
          { key: "product", header: "Product", width: 50 },
          { key: "sku", header: "SKU", width: 28 },
          { key: "kind", header: "Type", width: 28 },
          { key: "detail", header: "Reference", width: 32 },
          { key: "change", header: "Change", align: "right", width: 22 },
        ],
        rows: movements.map((m) => ({
          date: fmtDateTime(m.date),
          product: m.productName,
          sku: m.sku,
          kind: m.kind,
          detail: m.detail,
          change: m.change >= 0 ? `+${m.change}` : String(m.change),
        })),
        summary: summary.map((s) => ({ label: s.label, value: String(s.value) })),
      });
      return;
    }
    if (report === "stock-adjustment-history") {
      exportTablePdf({
        filename: "stock-adjustment-history.pdf",
        title: meta.name,
        shopName: db.settings.shop.name,
        orientation: "landscape",
        columns: [
          { key: "date", header: "Date", width: 36 },
          { key: "product", header: "Product", width: 48 },
          { key: "type", header: "Type", width: 24 },
          { key: "qty", header: "Qty", align: "right", width: 16 },
          { key: "before", header: "Before", align: "right", width: 18 },
          { key: "after", header: "After", align: "right", width: 18 },
          { key: "reason", header: "Reason", width: 40 },
          { key: "by", header: "By", width: 28 },
        ],
        rows: adjustments.map((a) => ({
          date: fmtDateTime(a.date),
          product: a.productName,
          type: a.type,
          qty: a.qty,
          before: a.before,
          after: a.after,
          reason: a.reason || "—",
          by: a.by,
        })),
        summary: summary.map((s) => ({ label: s.label, value: String(s.value) })),
      });
      return;
    }
    const list = productRows;
    exportTablePdf({
      filename: `${report}.pdf`,
      title: meta.name,
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "name", header: "Product", width: 50 },
        { key: "sku", header: "SKU", width: 26 },
        ...(report === "product-wise-stock"
          ? [
              { key: "brand", header: "Brand", width: 22 },
              { key: "cat", header: "Category", width: 28 },
            ]
          : []),
        { key: "stock", header: "Stock", align: "right" as const, width: 18 },
        { key: "pp", header: "Purchase", align: "right" as const, width: 24 },
        { key: "sp", header: "Sale", align: "right" as const, width: 24 },
        { key: "val", header: "Value", align: "right" as const, width: 26 },
        ...(showVelocity
          ? [
              { key: "sold", header: "Sold Qty", align: "right" as const, width: 20 },
              { key: "soldVal", header: "Sold Value", align: "right" as const, width: 26 },
            ]
          : []),
        { key: "status", header: "Status", width: 26 },
      ],
      rows: list.map((p) => ({
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        cat: catName(p.categoryId),
        stock: p.stock,
        pp: rs(p.purchasePrice),
        sp: rs(p.salePrice),
        val: rs(p.stock * p.purchasePrice),
        sold: p.soldQty ?? 0,
        soldVal: rs(p.soldValue ?? 0),
        status: stockStatus(p),
      })),
      summary: summary.map((s) => ({ label: s.label, value: String(s.value) })),
    });
  };

  return (
    <div>
      <PageHeader
        title={meta.name}
        description={meta.description}
        back={
          <Button asChild variant="outline" size="sm">
            <Link to="/reports/inventory"><ArrowLeft className="size-4" />All inventory reports</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={summaryIcons[s.label]} />
        ))}
      </div>

      <Card className="mt-4 gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search..." className="sm:max-w-56" />
          <SearchableSelect
            value={category}
            onChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...parentCategories(db.categories).map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="Category"
            className="sm:w-44"
          />
          {showRange && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="h-9 rounded-md border bg-background px-2 text-sm" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              <span className="text-muted-foreground">to</span>
              <input type="date" className="h-9 rounded-md border bg-background px-2 text-sm" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          </div>
        </FilterBar>

        {report === "stock-movement" ? (
          <DataTable loading={loading} columns={movementCols} rows={movements} rowKey={(m) => m.id} pageSize={15} empty={<EmptyState title="No stock movements found." />} />
        ) : report === "stock-adjustment-history" ? (
          <DataTable loading={loading} columns={adjustmentCols} rows={adjustments} rowKey={(a) => a.id} pageSize={15} empty={<EmptyState title="No stock adjustments found." />} />
        ) : (
          <DataTable
            loading={loading}
            columns={productCols}
            rows={productRows}
            rowKey={(p) => p.id}
            pageSize={15}
            empty={<EmptyState title="No products found for this report." />}
          />
        )}
      </Card>
    </div>
  );
}
