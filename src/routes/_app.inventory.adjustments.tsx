import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { FileText, Hash, PackageMinus, PackagePlus, SlidersHorizontal, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  DateRangePicker,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  SearchInput,
  SearchableSelect,
  SimpleSelect,
  StatCard,
  StatusBadge,
  useFakeLoading,
  type Column,
} from "@/components/shared";
import { actions, useDB } from "@/lib/store";
import { fmtDateTime, inRange, pageHead, type Range } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { type AdjustType, type Adjustment } from "@/lib/mock-data";

const ADJUST_TYPES: AdjustType[] = ["Add", "Remove", "Damage", "Lost", "Correction"];

export const Route = createFileRoute("/_app/inventory/adjustments")({
  validateSearch: z.object({ product: z.string().optional() }),
  head: pageHead("Stock Adjustments", "Manually add, remove, or correct product stock."),
  component: AdjustmentsPage,
});

type Form = {
  productId: string;
  type: AdjustType;
  qty: number;
  reason: string;
  notes: string;
};

const emptyForm = (productId = ""): Form => ({
  productId,
  type: "Add",
  qty: 1,
  reason: "",
  notes: "",
});

function previewAfter(stock: number, type: AdjustType, qty: number) {
  if (type === "Add") return stock + qty;
  if (type === "Correction") return qty;
  return Math.max(0, stock - qty);
}

function AdjustmentsPage() {
  const db = useDB();
  const { product: productParam } = Route.useSearch();
  const loading = useFakeLoading();
  const [form, setForm] = useState<Form>(() => emptyForm(productParam ?? ""));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [range, setRange] = useState<Range>({ from: "", to: "" });

  useEffect(() => {
    if (productParam) setForm((f) => ({ ...f, productId: productParam }));
  }, [productParam]);

  const productOptions = useMemo(
    () =>
      db.products
        .filter((p) => p.active)
        .map((p) => ({ value: p.id, label: `${p.name} · ${p.sku} · stock ${p.stock}` })),
    [db.products],
  );

  const selected = db.products.find((p) => p.id === form.productId);
  const nextStock = selected && form.qty >= 0 ? previewAfter(selected.stock, form.type, form.qty) : null;

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const byId = new Map(db.products.map((p) => [p.id, p]));
    return db.adjustments
      .filter((a) => {
        if (typeFilter !== "all" && a.type !== typeFilter) return false;
        if (!inRange(a.date, range)) return false;
        if (!query) return true;
        const p = byId.get(a.productId);
        return `${p?.name ?? ""} ${p?.sku ?? ""} ${a.reason} ${a.notes} ${a.type} ${a.by}`.toLowerCase().includes(query);
      })
      .map((a) => {
        const p = byId.get(a.productId);
        return { ...a, productName: p?.name ?? "—", sku: p?.sku ?? "—" };
      });
  }, [db.adjustments, db.products, q, typeFilter, range]);

  const totals = useMemo(() => {
    const all = db.adjustments;
    return {
      count: all.length,
      added: all.filter((a) => a.type === "Add").length,
      removed: all.filter((a) => a.type === "Remove" || a.type === "Damage" || a.type === "Lost").length,
      corrections: all.filter((a) => a.type === "Correction").length,
    };
  }, [db.adjustments]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.productId) e.productId = "Select a product.";
    if (!f.type) e.type = "Select an adjustment type.";
    if (f.type === "Correction") {
      if (f.qty < 0 || !Number.isFinite(f.qty)) e.qty = "Enter a valid stock quantity.";
    } else if (!f.qty || f.qty <= 0) {
      e.qty = "Enter a quantity greater than zero.";
    }
    if (!f.reason.trim()) e.reason = "Reason is required.";
    return e;
  };

  const save = () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    const product = db.products.find((p) => p.id === form.productId);
    if (!product) return;
    const after = previewAfter(product.stock, form.type, form.qty);
    actions.addAdjustment({
      productId: form.productId,
      type: form.type,
      qty: form.qty,
      reason: form.reason.trim(),
      notes: form.notes.trim(),
    });
    toast.success(`${product.name}: ${product.stock} → ${after}`);
    setForm(emptyForm(form.productId));
    setErrors({});
  };

  type Row = Adjustment & { productName: string; sku: string };

  const cols: Column<Row>[] = [
    { key: "date", header: "Date", cell: (a) => <span className="whitespace-nowrap text-sm">{fmtDateTime(a.date)}</span> },
    {
      key: "product",
      header: "Product",
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{a.productName}</p>
          <p className="font-mono text-xs text-muted-foreground">{a.sku}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (a) => <StatusBadge status={a.type} /> },
    { key: "qty", header: "Qty", cell: (a) => a.qty, className: "text-right" },
    { key: "before", header: "Before", cell: (a) => a.before, className: "text-right", mobileHidden: true },
    { key: "after", header: "After", cell: (a) => a.after, className: "text-right" },
    { key: "reason", header: "Reason", cell: (a) => a.reason || "—" },
    { key: "by", header: "By", cell: (a) => a.by, mobileHidden: true },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "stock-adjustments.pdf",
      title: "Stock Adjustments",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "date", header: "Date", width: 36 },
        { key: "product", header: "Product", width: 45 },
        { key: "sku", header: "SKU", width: 26 },
        { key: "type", header: "Type", width: 24 },
        { key: "qty", header: "Qty", align: "right", width: 16 },
        { key: "before", header: "Before", align: "right", width: 18 },
        { key: "after", header: "After", align: "right", width: 18 },
        { key: "reason", header: "Reason", width: 40 },
        { key: "by", header: "By", width: 24 },
      ],
      rows: rows.map((a) => ({
        date: fmtDateTime(a.date),
        product: a.productName,
        sku: a.sku,
        type: a.type,
        qty: a.qty,
        before: a.before,
        after: a.after,
        reason: a.reason || "—",
        by: a.by,
      })),
      summary: [{ label: "Records", value: String(rows.length) }],
    });
  };

  const qtyLabel = form.type === "Correction" ? "Correct stock to" : "Quantity";
  const qtyHint =
    form.type === "Correction"
      ? "Sets the stock to this exact number"
      : form.type === "Add"
        ? "Units to add to current stock"
        : "Units to remove from current stock";

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Adjustments" value={totals.count} icon={Hash} compact />
            <StatCard label="Added" value={totals.added} icon={PackagePlus} tone="success" compact />
            <StatCard label="Removed / damage / lost" value={totals.removed} icon={PackageMinus} tone="destructive" compact />
            <StatCard label="Corrections" value={totals.corrections} icon={Wrench} tone="info" compact />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4" />
              Adjust stock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Product" error={errors.productId}>
              <SearchableSelect
                value={form.productId}
                onChange={(v) => set("productId", v)}
                options={productOptions}
                placeholder="Search product…"
                emptyText="No products found."
                className="w-full"
              />
            </Field>

            {selected && (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Current stock: <b className="text-foreground">{selected.stock}</b>
                {nextStock != null && form.qty >= 0 && (
                  <>
                    {" "}
                    → <b className="text-foreground">{nextStock}</b>
                  </>
                )}
              </p>
            )}

            <Field label="Adjustment type" error={errors.type}>
              <SimpleSelect
                value={form.type}
                onChange={(v) => set("type", v as AdjustType)}
                options={ADJUST_TYPES.map((t) => ({ value: t, label: t }))}
                className="w-full"
              />
            </Field>

            <Field label={qtyLabel} error={errors.qty} hint={qtyHint}>
              <Input
                type="number"
                min={form.type === "Correction" ? 0 : 1}
                inputMode="numeric"
                className="bg-card"
                value={form.qty || ""}
                onChange={(e) => set("qty", Number(e.target.value) || 0)}
              />
            </Field>

            <Field label="Reason" error={errors.reason}>
              <Input
                className="bg-card"
                placeholder="e.g. Damaged in storage, Found stock"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
              />
            </Field>

            <Field label="Notes" hint="Optional">
              <Textarea
                className="bg-card"
                rows={2}
                placeholder="Any extra detail…"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>

            <Button className="w-full" onClick={save}>
              <SlidersHorizontal className="size-4" />
              Save adjustment
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <FilterBar>
            <SearchInput value={q} onChange={setQ} placeholder="Search product, reason, or person" className="sm:w-72" />
            <SimpleSelect
              value={typeFilter}
              onChange={setTypeFilter}
              className="sm:w-40"
              placeholder="All types"
              options={[{ value: "all", label: "All types" }, ...ADJUST_TYPES.map((t) => ({ value: t, label: t }))]}
            />
            <DateRangePicker value={range} onChange={setRange} />
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={doPdf}>
                <FileText className="size-4" />
                PDF
              </Button>
            </div>
          </FilterBar>
          <DataTable
            loading={loading}
            columns={cols}
            rows={rows}
            rowKey={(a) => a.id}
            pageSize={15}
            empty={<EmptyState title="No stock adjustments yet." description="Use the form to add, remove, damage, lose, or correct stock." />}
          />
        </Card>
      </div>
    </div>
  );
}
