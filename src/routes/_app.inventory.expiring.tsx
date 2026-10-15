import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, FileText, PackageX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, EmptyState, FilterBar, PageHeader, ProductThumb, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { useDB } from "@/lib/store";
import type { Product } from "@/lib/mock-data";
import {
  expiryBadge,
  expiryPhrase,
  expiryStatus,
  fmtExpiry,
  productSearchText,
  productVariantLabel,
  productsAtRisk,
  qtyWithUnit,
} from "@/lib/product-attrs";

export const Route = createFileRoute("/_app/inventory/expiring")({
  head: pageHead("Expiring Stock", "Products that are expired or expire within 30 days."),
  component: ExpiringPage,
});

type Filter = "all" | "soon" | "expired";

function ExpiringPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const atRisk = useMemo(() => productsAtRisk(db.products), [db.products]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return atRisk.filter((p) => {
      const status = expiryStatus(p.expiryDate);
      if (filter === "soon" && status !== "soon") return false;
      if (filter === "expired" && status !== "expired") return false;
      if (needle && !productSearchText(p).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [atRisk, q, filter]);

  const expired = atRisk.filter((p) => expiryStatus(p.expiryDate) === "expired").length;
  const soon = atRisk.length - expired;
  const value = atRisk.reduce((sum, p) => sum + p.stock * p.purchasePrice, 0);

  const cols: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={p} />
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{[p.sku, p.brand, productVariantLabel(p)].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "unit", header: "Unit", cell: (p) => p.unit || "Piece", mobileHidden: true },
    { key: "stock", header: "Stock", cell: (p) => qtyWithUnit(p.stock, p.unit), className: "text-center" },
    { key: "value", header: "Stock value", cell: (p) => rs(p.stock * p.purchasePrice), className: "text-right", mobileHidden: true },
    {
      key: "expiry",
      header: "Expiry",
      cell: (p) => (
        <div>
          <p>{p.expiryDate ? fmtExpiry(p.expiryDate) : "—"}</p>
          <p className="text-xs text-muted-foreground">{expiryPhrase(p.expiryDate)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => {
        const badge = expiryBadge(expiryStatus(p.expiryDate));
        return badge ? <StatusBadge status={badge} /> : "—";
      },
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "expiring-stock.pdf",
      title: "Expiring Stock",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "name", header: "Product", width: 48 },
        { key: "details", header: "Size / color", width: 36 },
        { key: "stock", header: "Stock", width: 22 },
        { key: "expiry", header: "Expiry", width: 28 },
        { key: "when", header: "Status", width: 36 },
        { key: "value", header: "Value", align: "right", width: 24 },
      ],
      rows: rows.map((p) => ({
        name: p.name,
        details: productVariantLabel(p) || "—",
        stock: qtyWithUnit(p.stock, p.unit),
        expiry: p.expiryDate ? fmtExpiry(p.expiryDate) : "—",
        when: expiryPhrase(p.expiryDate),
        value: rs(p.stock * p.purchasePrice),
      })),
      summary: [
        { label: "Expiring soon", value: String(soon) },
        { label: "Expired", value: String(expired) },
        { label: "Stock value", value: rs(value) },
      ],
    });
  };

  return (
    <div>
      <PageHeader
        title="Expiring Stock"
        description="In-stock products that are already expired, or expire within the next 30 days."
        back={<Button variant="outline" asChild><Link to="/inventory">Back to stock</Link></Button>}
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-3 gap-2">
            <StatCard label="Expiring soon" value={soon} icon={CalendarClock} tone="warning" compact />
            <StatCard label="Expired" value={expired} icon={PackageX} tone="destructive" compact />
            <StatCard label="Value at risk" value={rs(value)} icon={TriangleAlert} tone="warning" compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, size or barcode" className="sm:w-72" />
          <SearchableSelect
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            className="sm:w-52"
            options={[
              { value: "all", label: "Expired and expiring" },
              { value: "soon", label: "Expiring within 30 days" },
              { value: "expired", label: "Already expired" },
            ]}
          />
          <Button variant="outline" onClick={doPdf} className="sm:ml-auto"><FileText className="size-4" />PDF</Button>
        </FilterBar>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(p) => p.id}
          loading={loading}
          pageSize={12}
          onRowClick={(p) => navigate({ to: "/products/$id", params: { id: p.id } })}
          empty={<EmptyState icon={CalendarClock} title="No products are expiring." description="Set an expiry date on formula, food or lotion. Items inside 30 days show up here." />}
        />
      </Card>
    </div>
  );
}
