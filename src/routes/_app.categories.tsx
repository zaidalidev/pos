import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Boxes, FileText, FolderTree, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, SearchableSelect, StatCard, useFakeLoading, type Column } from "@/components/shared";
import { actions, useDB } from "@/lib/store";
import { pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { categoryLabel, parentCategories, subcategoriesOf, type Category } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/categories")({
  head: pageHead("Categories", "Product categories, subcategories and how many items sit in each one."),
  component: CategoriesPage,
});

type Form = { name: string; description: string; parentId: string };
const emptyCat: Form = { name: "", description: "", parentId: "" };
const emptySub: Form = { name: "", description: "", parentId: "" };

type DialogState = { mode: "add-cat" | "add-sub" | "edit"; data: Form; id?: string };

function CategoriesPage() {
  const db = useDB();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"name" | "parentId", string>>>({});
  const [del, setDel] = useState<Category | null>(null);

  const parents = useMemo(() => parentCategories(db.categories), [db.categories]);

  const productCount = (id: string) => {
    const childIds = new Set(subcategoriesOf(db.categories, id).map((c) => c.id));
    return db.products.filter((p) => p.categoryId === id || childIds.has(p.categoryId)).length;
  };
  const directProductCount = (id: string) => db.products.filter((p) => p.categoryId === id).length;
  const stockValue = (id: string) => {
    const childIds = new Set(subcategoriesOf(db.categories, id).map((c) => c.id));
    return db.products.filter((p) => p.categoryId === id || childIds.has(p.categoryId)).reduce((a, p) => a + p.stock * p.purchasePrice, 0);
  };

  const rows = useMemo(() => {
    const list = db.categories.filter((c) => !q || `${c.name} ${c.description} ${categoryLabel(db.categories, c.id)}`.toLowerCase().includes(q.toLowerCase()));
    return [...list].sort((a, b) => {
      const aParent = a.parentId ?? a.id;
      const bParent = b.parentId ?? b.id;
      if (aParent !== bParent) {
        const ap = db.categories.find((c) => c.id === aParent)?.name ?? "";
        const bp = db.categories.find((c) => c.id === bParent)?.name ?? "";
        return ap.localeCompare(bp);
      }
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [db.categories, q]);

  const totals = useMemo(() => {
    const emptyCats = db.categories.filter((c) => directProductCount(c.id) === 0 && (!c.parentId ? subcategoriesOf(db.categories, c.id).every((s) => directProductCount(s.id) === 0) : true)).length;
    const value = db.products.reduce((a, p) => a + p.stock * p.purchasePrice, 0);
    return { emptyCats, value, subs: subcategoriesOf(db.categories).length };
  }, [db]);

  const validate = (f: Form, mode: DialogState["mode"]) => {
    const e: Partial<Record<"name" | "parentId", string>> = {};
    const name = f.name.trim();
    if (!name) e.name = "Name is required.";
    if (mode === "add-sub" || (mode === "edit" && dialog?.data.parentId)) {
      if (!f.parentId) e.parentId = "Choose a parent category.";
    }
    const siblings = db.categories.filter((c) => {
      if (c.id === dialog?.id) return false;
      const sameParent = (c.parentId ?? "") === (f.parentId || "");
      return sameParent;
    });
    if (name && siblings.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      e.name = f.parentId ? "A subcategory with this name already exists under this category." : "A category with this name already exists.";
    }
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data, dialog.mode);
    setErrors(e);
    if (Object.keys(e).length) return;
    const isSub = dialog.mode === "add-sub" || (dialog.mode === "edit" && !!dialog.data.parentId);
    actions.saveCategory({
      name: dialog.data.name.trim(),
      description: dialog.data.description.trim(),
      parentId: isSub ? dialog.data.parentId || null : null,
      ...(dialog.id ? { id: dialog.id } : {}),
    });
    toast.success(
      dialog.mode === "add-cat" ? "Category added." : dialog.mode === "add-sub" ? "Subcategory added." : "Category updated.",
    );
    setDialog(null);
    setQ("");
  };

  const askDelete = (c: Category) => {
    const children = subcategoriesOf(db.categories, c.id).length;
    if (children) {
      toast.error(`${c.name} has ${children} subcategor${children === 1 ? "y" : "ies"}. Remove them first.`);
      return;
    }
    const n = directProductCount(c.id);
    if (n) {
      toast.error(`${c.name} has ${n} product${n === 1 ? "" : "s"}. Move them before deleting.`);
      return;
    }
    setDel(c);
  };

  const cols: Column<Category>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) =>
        c.parentId ? (
          <span className="pl-4 text-muted-foreground">↳ {c.name}</span>
        ) : (
          <span className="font-semibold text-primary">{c.name}</span>
        ),
    },
    {
      key: "type",
      header: "Type",
      cell: (c) => (c.parentId ? "Subcategory" : "Category"),
    },
    {
      key: "parent",
      header: "Parent",
      cell: (c) => (c.parentId ? db.categories.find((x) => x.id === c.parentId)?.name ?? "—" : "—"),
      mobileHidden: true,
    },
    { key: "description", header: "Description", cell: (c) => <span className="text-muted-foreground">{c.description || "—"}</span> },
    { key: "products", header: "Products", cell: (c) => productCount(c.id), className: "text-right" },
    { key: "value", header: "Stock value", cell: (c) => rs(stockValue(c.id)), className: "text-right", mobileHidden: true },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {!c.parentId && (
              <DropdownMenuItem
                onClick={() => {
                  setDialog({ mode: "add-sub", data: { ...emptySub, parentId: c.id } });
                  setErrors({});
                }}
              >
                <Plus className="size-4" />Add subcategory
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                setDialog({ mode: "edit", id: c.id, data: { name: c.name, description: c.description, parentId: c.parentId ?? "" } });
                setErrors({});
              }}
            >
              <Pencil className="size-4" />Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => askDelete(c)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "categories.pdf",
      title: "Categories",
      shopName: db.settings.shop.name,
      columns: [
        { key: "name", header: "Name", width: 40 },
        { key: "type", header: "Type", width: 24 },
        { key: "parent", header: "Parent", width: 32 },
        { key: "description", header: "Description", width: 50 },
        { key: "products", header: "Products", align: "right", width: 22 },
        { key: "value", header: "Stock value", align: "right", width: 28 },
      ],
      rows: rows.map((c) => ({
        name: c.name,
        type: c.parentId ? "Subcategory" : "Category",
        parent: c.parentId ? db.categories.find((x) => x.id === c.parentId)?.name ?? "—" : "—",
        description: c.description || "—",
        products: productCount(c.id),
        value: rs(stockValue(c.id)),
      })),
      summary: [
        { label: "Categories", value: String(parents.length) },
        { label: "Subcategories", value: String(totals.subs) },
        { label: "Stock value", value: rs(totals.value) },
      ],
    });
  };

  const openAddCat = () => { setDialog({ mode: "add-cat", data: emptyCat }); setErrors({}); };
  const openAddSub = () => {
    setDialog({ mode: "add-sub", data: { ...emptySub, parentId: parents[0]?.id ?? "" } });
    setErrors({});
  };

  const title =
    dialog?.mode === "add-cat" ? "Add Category"
      : dialog?.mode === "add-sub" ? "Add Subcategory"
        : dialog?.data.parentId ? "Edit Subcategory" : "Edit Category";

  return (
    <div>
      <PageHeader
        title="Categories"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Categories" value={parents.length} icon={Tags} compact />
            <StatCard label="Subcategories" value={totals.subs} icon={FolderTree} tone="info" compact />
            <StatCard label="Products" value={db.products.length} icon={Boxes} compact />
            <StatCard label="Stock value" value={rs(totals.value)} icon={Banknote} tone="success" compact />
          </div>
        }
      />
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name or description" className="sm:w-72" />
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button variant="outline" onClick={openAddSub} disabled={!parents.length}><Plus className="size-4" />Add Subcategory</Button>
            <Button onClick={openAddCat}><Plus className="size-4" />Add Category</Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => {
            setDialog({ mode: "edit", id: c.id, data: { name: c.name, description: c.description, parentId: c.parentId ?? "" } });
            setErrors({});
          }}
          empty={
            <EmptyState
              icon={Tags}
              title={q ? "No categories match your search." : "No categories yet."}
              description={q ? "Try a different name." : "Add a category so products can be grouped."}
              action={!q ? <Button onClick={openAddCat}><Plus className="size-4" />Add Category</Button> : undefined}
            />
          }
        />
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="grid gap-3">
              {(dialog.mode === "add-sub" || (dialog.mode === "edit" && dialog.data.parentId)) && (
                <Field label="Parent category" error={errors.parentId}>
                  <SearchableSelect
                    value={dialog.data.parentId}
                    onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, parentId: v } })}
                    options={parents.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select parent category"
                  />
                </Field>
              )}
              <Field label="Name" error={errors.name}>
                <Input
                  autoFocus
                  value={dialog.data.name}
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })}
                  placeholder={dialog.mode === "add-sub" || dialog.data.parentId ? "e.g. Silicone Cases" : "e.g. Mobile Covers"}
                />
              </Field>
              <Field label="Description" hint="Optional. Shown on the category list.">
                <Textarea
                  value={dialog.data.description}
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, description: e.target.value } })}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.name}?`}
        description={del?.parentId ? "This subcategory has no products, so it can be removed." : "This category has no products or subcategories, so it can be removed."}
        onConfirm={() => {
          if (del) {
            const ok = actions.deleteCategory(del.id);
            if (ok) toast.success(del.parentId ? "Subcategory deleted." : "Category deleted.");
            else toast.error("Could not delete — it still has products or subcategories.");
          }
          setDel(null);
        }}
      />
    </div>
  );
}
