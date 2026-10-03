import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Boxes, Eye, FileText, MoreHorizontal, PackageX, Pencil, Plus, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, DataTable, EmptyState, FilterBar, PageHeader, ProductThumb, SearchInput, SearchableSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { actions, productDeleteBlockReason, stockStatus, useDB } from "@/lib/store";
import { pageHead, rs, supplierName } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { categoryLabel, matchesCategory, parentCategories, type Product } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/products/")({
  head: pageHead("Products", "Browse, search and manage your product catalogue."),
  component: ProductsPage,
});

function ProductsPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sup, setSup] = useState("all");
  const [stock, setStock] = useState("all");
  const [del, setDel] = useState<Product | null>(null);

  const catName = (id: string) => categoryLabel(db.categories, id);
  const supName = (id: string) => supplierName(db.suppliers, id);

  const rows = useMemo(
    () =>
      db.products.filter(
        (p) =>
          (!q || `${p.name} ${p.sku} ${p.barcode} ${p.brand}`.toLowerCase().includes(q.toLowerCase())) &&
          matchesCategory(db.categories, p.categoryId, cat) &&
          (sup === "all" || p.supplierId === sup) &&
          (stock === "all" || stockStatus(p) === stock),
      ),
    [db, q, cat, sup, stock],
  );

  const stockValue = db.products.reduce((a, p) => a + p.stock * p.purchasePrice, 0);
  const low = db.products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const out = db.products.filter((p) => p.stock <= 0).length;

  const cols: Column<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={p} />
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">{p.sku} · {p.brand}</p>
          </div>
        </div>
      ),
    },
    { key: "cat", header: "Category", cell: (p) => catName(p.categoryId) },
    { key: "sup", header: "Supplier", cell: (p) => <span className="text-sm">{supName(p.supplierId)}</span>, mobileHidden: true },
    { key: "pp", header: "Purchase", cell: (p) => rs(p.purchasePrice), className: "text-right" },
    { key: "sp", header: "Sale", cell: (p) => <b>{rs(p.salePrice)}</b>, className: "text-right" },
    { key: "stock", header: "Stock", cell: (p) => <span className={p.stock <= p.minStock ? "font-semibold text-warning" : ""}>{p.stock}</span>, className: "text-center" },
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
            <DropdownMenuItem onClick={() => navigate({ to: "/products/$id", params: { id: p.id } })}><Eye className="size-4" />View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/products/$id/edit", params: { id: p.id } })}><Pencil className="size-4" />Edit product</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/inventory/adjustments", search: { product: p.id } })}><SlidersHorizontal className="size-4" />Adjust stock</DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                const reason = productDeleteBlockReason(db, p.id);
                if (reason) {
                  toast.error(reason);
                  return;
                }
                setDel(p);
              }}
            >
              <Trash2 className="size-4" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "products.pdf",
      title: "Products",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "name", header: "Name", width: 45 },
        { key: "sku", header: "SKU", width: 24 },
        { key: "cat", header: "Category", width: 28 },
        { key: "brand", header: "Brand", width: 24 },
        { key: "purchase", header: "Purchase", align: "right", width: 24 },
        { key: "sale", header: "Sale", align: "right", width: 24 },
        { key: "stock", header: "Stock", align: "right", width: 16 },
        { key: "status", header: "Status", width: 24 },
      ],
      rows: rows.map((p) => ({
        name: p.name,
        sku: p.sku,
        cat: catName(p.categoryId),
        brand: p.brand,
        purchase: rs(p.purchasePrice),
        sale: rs(p.salePrice),
        stock: p.stock,
        status: stockStatus(p),
      })),
      summary: [
        { label: "Products", value: String(rows.length) },
        { label: "Stock value", value: rs(stockValue) },
      ],
    });
  };

  return (
    <div>
      <PageHeader
        title="Products"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Total products" value={db.products.length} icon={Boxes} compact />
            <StatCard label="Stock value" value={rs(stockValue)} icon={Banknote} tone="info" compact />
            <StatCard label="Low stock" value={low} icon={TriangleAlert} tone="warning" compact />
            <StatCard label="Out of stock" value={out} icon={PackageX} tone="destructive" compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, SKU or barcode..." className="sm:w-72" />
          <SearchableSelect
            value={cat}
            onChange={setCat}
            className="sm:w-44"
            placeholder="All categories"
            options={[{ value: "all", label: "All categories" }, ...parentCategories(db.categories).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <SearchableSelect
            value={sup}
            onChange={setSup}
            className="sm:w-52"
            placeholder="All suppliers"
            options={[{ value: "all", label: "All suppliers" }, ...db.suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          />
          <SearchableSelect
            value={stock}
            onChange={setStock}
            className="sm:w-40"
            placeholder="All stock"
            options={[{ value: "all", label: "All stock" }, "In Stock", "Low Stock", "Out of Stock"]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button asChild><Link to="/products/new"><Plus className="size-4" />Add Product</Link></Button>
          </div>
        </FilterBar>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(p) => p.id}
          loading={loading}
          pageSize={12}
          onRowClick={(p) => navigate({ to: "/products/$id", params: { id: p.id } })}
          empty={<EmptyState title="No products match your filters." description="Try a different search, or add a new product." action={<Button asChild><Link to="/products/new"><Plus className="size-4" />Add Product</Link></Button>} />}
        />
      </Card>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.name}?`}
        description="All sales and purchases for this product are fully returned. Remove it from your catalogue?"
        onConfirm={() => {
          if (!del) return;
          const result = actions.deleteProduct(del.id);
          if (result === "ok") toast.success(`${del.name} deleted.`);
          else if (result === "blocked") toast.error(productDeleteBlockReason(db, del.id) ?? "Cannot delete this product yet.");
          else toast.error("Product not found.");
          setDel(null);
        }}
      />
    </div>
  );
}
