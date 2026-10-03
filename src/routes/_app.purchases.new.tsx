import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput, Field, PageHeader, ProductThumb, SearchableSelect, SimpleSelect } from "@/components/shared";
import { actions, getState, isCreditAccount, useDB } from "@/lib/store";
import { pageHead, rs } from "@/lib/format";
import { accountIdOf, parentCategories, type Purchase } from "@/lib/mock-data";

type SupplierDialog = { name: string; phone: string; address: string; city: string };
const emptySupplier: SupplierDialog = { name: "", phone: "", address: "", city: "" };

type ProductDialog = { name: string; sku: string; categoryId: string; purchasePrice: number; salePrice: number };
type ProductDialogErrors = Partial<Record<"name" | "sku" | "categoryId" | "purchasePrice" | "salePrice" | "supplierId", string>>;
const emptyProduct = (categoryId: string): ProductDialog => ({
  name: "", sku: "", categoryId, purchasePrice: 0, salePrice: 0,
});

export const Route = createFileRoute("/_app/purchases/new")({
  validateSearch: z.object({ edit: z.string().optional() }),
  head: pageHead("New Purchase", "Create or edit a stock purchase from a supplier."),
  component: NewPurchase,
});

type Line = { productId: string; qty: number; price: number };

function accountIdOfPurchase(p: Purchase, creditId: string): string {
  if (p.paid === 0 && p.total > 0) return creditId;
  return p.payments[0]?.accountId ?? accountIdOf("Cash");
}

function NewPurchase() {
  const db = useDB();
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const editing = editId ? db.purchases.find((p) => p.id === editId) : undefined;
  const editingBlocked = !!editId && (!editing || editing.status === "Returned" || db.purchaseReturns.some((r) => r.purchaseId === editId));
  const isEditing = !!editing && !editingBlocked;
  const accountOptions = useMemo(
    () => db.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name })),
    [db.accounts],
  );
  const defaultAccountId = db.accounts.find((a) => a.active && a.type === "Cash")?.id ?? accountIdOf("Cash");
  const creditAccountId = db.accounts.find((a) => a.type === "Credit")?.id ?? accountIdOf("Credit");

  const [supplierId, setSupplierId] = useState(db.suppliers[0]?.id ?? "");
  const [addProductId, setAddProductId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [editLoaded, setEditLoaded] = useState(false);
  const [supplierDialog, setSupplierDialog] = useState<SupplierDialog | null>(null);
  const [supplierErrors, setSupplierErrors] = useState<Partial<Record<"name" | "phone" | "city", string>>>({});
  const [productDialog, setProductDialog] = useState<ProductDialog | null>(null);
  const [productErrors, setProductErrors] = useState<ProductDialogErrors>({});
  const parents = useMemo(() => parentCategories(db.categories), [db.categories]);

  useEffect(() => {
    setEditLoaded(false);
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    if (editingBlocked) {
      toast.error(!editing ? "Purchase not found." : "This purchase cannot be edited.");
      navigate({ to: "/purchases/new", search: {}, replace: true });
      return;
    }
    if (!editing || editLoaded) return;
    setSupplierId(editing.supplierId);
    setLines(editing.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })));
    setDiscount(editing.discount);
    setAccountId(accountIdOfPurchase(editing, creditAccountId));
    setPaid(editing.paid);
    setNotes(editing.notes);
    setEditLoaded(true);
  }, [editId, editing, editingBlocked, editLoaded, navigate, creditAccountId]);

  const productOpts = useMemo(
    () => db.products.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} · ${rs(p.purchasePrice)}` })),
    [db.products],
  );

  const resolved = lines.map((l) => ({ ...l, product: db.products.find((p) => p.id === l.productId)! })).filter((l) => l.product);
  const subtotal = resolved.reduce((a, l) => a + l.qty * l.price, 0);
  const total = Math.max(0, subtotal - discount);
  const isCredit = isCreditAccount(db, accountId);
  const dueAmt = isCredit ? total : Math.max(0, total - paid);

  // Credit account = unpaid; otherwise leave paid as user entered (default 0 / Unpaid)
  useEffect(() => {
    if (isCredit) setPaid(0);
  }, [isCredit]);

  const addLine = (productId: string) => {
    if (!productId) return;
    const p = getState().products.find((x) => x.id === productId);
    if (!p) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) return prev.map((l) => l.productId === productId ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { productId, qty: 1, price: p.purchasePrice }];
    });
    setAddProductId("");
  };

  const updateLine = (productId: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l) => l.productId === productId ? { ...l, ...patch } : l));
  };

  const removeLine = (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId));

  const cancelEdit = () => navigate({ to: "/purchases" });

  const openSupplierDialog = () => {
    setSupplierDialog({ ...emptySupplier });
    setSupplierErrors({});
  };

  const openProductDialog = () => {
    if (!supplierId) {
      toast.error("Select a supplier first.");
      return;
    }
    setProductDialog(emptyProduct(parents[0]?.id ?? ""));
    setProductErrors({});
  };

  const saveProduct = () => {
    if (!productDialog) return;
    const e: ProductDialogErrors = {};
    const name = productDialog.name.trim();
    const sku = productDialog.sku.trim().toUpperCase();
    if (!name) e.name = "Product name is required.";
    if (sku && db.products.some((p) => p.sku && p.sku.toLowerCase() === sku.toLowerCase())) e.sku = "This SKU is already used.";
    if (!productDialog.categoryId) e.categoryId = "Choose a category.";
    if (!supplierId) e.supplierId = "Select a supplier first.";
    if (productDialog.purchasePrice <= 0) e.purchasePrice = "Enter the purchase price.";
    if (productDialog.salePrice <= 0) e.salePrice = "Enter the sale price.";
    else if (productDialog.salePrice < productDialog.purchasePrice) e.salePrice = "Sale price is lower than purchase price.";
    setProductErrors(e);
    if (Object.keys(e).length) return;

    const id = actions.addProduct({
      name,
      sku,
      barcode: "",
      categoryId: productDialog.categoryId,
      brand: "",
      purchasePrice: productDialog.purchasePrice,
      salePrice: productDialog.salePrice,
      wholesalePrice: 0,
      stock: 0,
      minStock: 5,
      supplierId,
      description: "",
      active: true,
    });
    toast.success(`${name} added.`);
    setProductDialog(null);
    addLine(id);
  };

  const saveSupplier = () => {
    if (!supplierDialog) return;
    const e: Partial<Record<"name" | "phone" | "city", string>> = {};
    const name = supplierDialog.name.trim();
    const phone = supplierDialog.phone.trim();
    const city = supplierDialog.city.trim();
    if (!name) e.name = "Name is required.";
    if (!phone) e.phone = "Phone is required.";
    if (!city) e.city = "City is required.";
    if (
      name &&
      db.suppliers.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      e.name = "This supplier already exists.";
    }
    setSupplierErrors(e);
    if (Object.keys(e).length) return;

    const before = new Set(db.suppliers.map((s) => s.id));
    actions.saveSupplier({
      name,
      contact: name,
      phone,
      address: supplierDialog.address.trim(),
      city,
    });
    const created = getState().suppliers.find((s) => !before.has(s.id));
    if (created) setSupplierId(created.id);
    toast.success("Supplier added.");
    setSupplierDialog(null);
  };

  const submit = () => {
    if (!supplierId) { toast.error("Select a supplier."); return; }
    if (!resolved.length) { toast.error("Add at least one product."); return; }
    if (resolved.some((l) => l.qty <= 0)) { toast.error("Quantity must be greater than zero."); return; }
    if (resolved.some((l) => l.price < 0)) { toast.error("Purchase price cannot be negative."); return; }
    if (discount > subtotal) { toast.error("Discount cannot exceed subtotal."); return; }
    if (!isCredit && paid < 0) { toast.error("Paid amount cannot be negative."); return; }

    const payload = {
      supplierId,
      items: resolved.map((l) => ({ productId: l.productId, name: l.product.name, qty: l.qty, price: l.price, cost: l.price })),
      discount,
      paid: isCredit ? 0 : paid,
      notes: notes.trim(),
      accountId,
    };

    if (isEditing && editing) {
      const pur = actions.updatePurchase(editing.id, payload);
      if (!pur) {
        toast.error("Could not update purchase. Stock may have already been sold.");
        return;
      }
      toast.success(`${pur.no} updated. Stock adjusted.`);
      navigate({ to: "/purchases" });
      return;
    }

    const pur = actions.addPurchase(payload);
    toast.success(`${pur.no} created. Stock updated.`);
    navigate({ to: "/purchases" });
  };

  return (
    <div>
      <PageHeader
        title={isEditing ? `Edit ${editing.no}` : "New Purchase"}
        description={isEditing
          ? "Update supplier, items, or payment. Inventory will be adjusted automatically."
          : "Add stock from a supplier. Purchase price and inventory update automatically."}
        back={<Button variant="outline" asChild><Link to="/purchases"><ArrowLeft className="size-4" />Back</Link></Button>}
      />

      {isEditing && editing && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><Pencil className="size-4 text-primary" />Editing purchase <span className="font-semibold text-primary">{editing.no}</span></p>
          <Button variant="outline" size="sm" onClick={cancelEdit}><X className="size-4" />Cancel edit</Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="shadow-none">
            <CardHeader><CardTitle className="text-base">Supplier & products</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Supplier">
                <div className="flex gap-2">
                  <SearchableSelect
                    className="flex-1"
                    value={supplierId}
                    onChange={setSupplierId}
                    placeholder="Select supplier"
                    options={db.suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={openSupplierDialog} aria-label="Add supplier">
                    <Plus className="size-4" />
                  </Button>
                </div>
              </Field>
              <Field label="Add product">
                <div className="flex gap-2">
                  <SearchableSelect
                    value={addProductId}
                    onChange={(v) => { setAddProductId(v); addLine(v); }}
                    className="flex-1"
                    placeholder="Search product by name"
                    options={productOpts}
                  />
                  <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={openProductDialog} aria-label="Add product">
                    <Plus className="size-4" />
                  </Button>
                </div>
              </Field>

              {resolved.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  <ShoppingBag className="mx-auto mb-2 size-5 opacity-50" />
                  No products added yet. Search and add items above.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[1fr_88px_120px_40px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Product</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Purchase price</span>
                    <span />
                  </div>
                  {resolved.map((l) => (
                    <div key={l.productId} className="grid grid-cols-[1fr_88px_120px_40px] items-center gap-2 border-b px-3 py-2 last:border-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <ProductThumb product={l.product} className="size-9 shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.product.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{l.product.sku} · Stock {l.product.stock}</p>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => updateLine(l.productId, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        className="bg-card text-right"
                        aria-label="Quantity"
                      />
                      <CurrencyInput
                        value={l.price}
                        onChange={(n) => updateLine(l.productId, { price: Math.max(0, n) })}
                      />
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => removeLine(l.productId)} aria-label="Remove">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Field label="Notes">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes for this purchase" className="bg-card" />
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit shadow-none">
          <CardHeader><CardTitle className="text-base">Payment summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rs(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{rs(discount)}</span></div>
              <div className="flex justify-between border-t pt-1.5 text-base font-semibold"><span>Grand total</span><span>{rs(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{rs(isCredit ? 0 : paid)}</span></div>
              <div className="flex justify-between font-medium text-destructive"><span>Due</span><span>{rs(dueAmt)}</span></div>
            </div>
            <Field label="Discount">
              <CurrencyInput value={discount} onChange={setDiscount} />
            </Field>
            <Field label="Account">
              <SimpleSelect value={accountId} onChange={setAccountId} options={accountOptions} />
            </Field>
            {!isCredit && (
              <Field label="Paid amount" hint={paid < total ? `Due will be ${rs(Math.max(0, total - paid))}` : undefined}>
                <CurrencyInput
                  value={paid}
                  onChange={setPaid}
                />
              </Field>
            )}
            <Button className="w-full" onClick={submit} disabled={!supplierId || !resolved.length}>
              {isEditing ? <><Pencil className="size-4" />Save changes</> : <><Plus className="size-4" />Create purchase</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!supplierDialog} onOpenChange={(o) => !o && setSupplierDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          {supplierDialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={supplierErrors.name} className="sm:col-span-2">
                <Input
                  autoFocus
                  value={supplierDialog.name}
                  onChange={(e) => setSupplierDialog({ ...supplierDialog, name: e.target.value })}
                  placeholder="e.g. Link Road Ahsan"
                />
              </Field>
              <Field label="Phone" error={supplierErrors.phone}>
                <Input
                  value={supplierDialog.phone}
                  onChange={(e) => setSupplierDialog({ ...supplierDialog, phone: e.target.value })}
                  placeholder="03xxxxxxxxx"
                />
              </Field>
              <Field label="City" error={supplierErrors.city}>
                <Input
                  value={supplierDialog.city}
                  onChange={(e) => setSupplierDialog({ ...supplierDialog, city: e.target.value })}
                  placeholder="Lahore"
                />
              </Field>
              <Field label="Address" hint="Optional" className="sm:col-span-2">
                <Textarea
                  value={supplierDialog.address}
                  onChange={(e) => setSupplierDialog({ ...supplierDialog, address: e.target.value })}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialog(null)}>Cancel</Button>
            <Button onClick={saveSupplier}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!productDialog} onOpenChange={(o) => !o && setProductDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          {productDialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={productErrors.name} className="sm:col-span-2">
                <Input
                  autoFocus
                  value={productDialog.name}
                  onChange={(e) => setProductDialog({ ...productDialog, name: e.target.value })}
                  placeholder="Product name"
                />
              </Field>
              <Field label="SKU" error={productErrors.sku} hint="Optional">
                <Input
                  value={productDialog.sku}
                  onChange={(e) => setProductDialog({ ...productDialog, sku: e.target.value })}
                  placeholder="SKU-001"
                />
              </Field>
              <Field label="Category" error={productErrors.categoryId}>
                <SearchableSelect
                  value={productDialog.categoryId}
                  onChange={(v) => setProductDialog({ ...productDialog, categoryId: v })}
                  placeholder="Select category"
                  options={parents.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Purchase price" error={productErrors.purchasePrice}>
                <CurrencyInput
                  value={productDialog.purchasePrice}
                  onChange={(n) => setProductDialog({ ...productDialog, purchasePrice: n })}
                />
              </Field>
              <Field label="Sale price" error={productErrors.salePrice}>
                <CurrencyInput
                  value={productDialog.salePrice}
                  onChange={(n) => setProductDialog({ ...productDialog, salePrice: n })}
                />
              </Field>
              {productErrors.supplierId && (
                <p className="text-sm text-destructive sm:col-span-2">{productErrors.supplierId}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(null)}>Cancel</Button>
            <Button onClick={saveProduct}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
