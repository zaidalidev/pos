import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, Banknote, Check, CheckCircle2, ChevronsUpDown, CreditCard, FileText, Landmark, Minus, PauseCircle, Pencil, Plus, Printer, Smartphone, Trash2, Wallet, X, Clock, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog, CurrencyInput, ProductThumb, SearchInput, EmptyState } from "@/components/shared";
import { InvoicePreview, downloadInvoicePdf } from "@/components/invoice-preview";
import { actions, findAccount, useDB } from "@/lib/store";
import { pageHead, rs, fmtTime } from "@/lib/format";
import { accountIdOf, matchesCategory, parentCategories, type AccountType, type Customer, type Sale } from "@/lib/mock-data";
import { expiryPhrase, expiryStatus, fmtExpiry, productSearchText, productVariantLabel, qtyWithUnit } from "@/lib/product-attrs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pos")({
  validateSearch: z.object({ edit: z.string().optional() }),
  head: pageHead("POS", "Fast point of sale with barcode scanning and multiple payment methods."),
  component: POS,
});

const TYPE_ICON: Record<AccountType, React.ComponentType<{ className?: string }>> = { Cash: Banknote, Card: CreditCard, Bank: Landmark, Easypaisa: Smartphone, JazzCash: Wallet, Credit: Clock };
const POS_PAGE_SIZE = 48;
const CUSTOMER_PICKER_LIMIT = 40;

function POS() {
  const db = useDB();
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const editingSale = editId ? db.sales.find((s) => s.id === editId) : undefined;
  const editingBlocked = !!editId && (!editingSale || editingSale.status === "Returned" || db.saleReturns.some((r) => r.saleId === editId));
  const activeAccounts = useMemo(() => db.accounts.filter((a) => a.active), [db.accounts]);
  const defaultAccountId = activeAccounts.find((a) => a.type === "Cash")?.id ?? accountIdOf("Cash");
  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<{ productId: string; qty: number }[]>([]);
  const [discount, setDiscount] = useState(0);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [received, setReceived] = useState(0);
  const [customerId, setCustomerId] = useState("walkin");
  const [done, setDone] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(POS_PAGE_SIZE);
  const searchRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const skipReceivedSync = useRef(false);
  const [cartInView, setCartInView] = useState(false);
  const [expiryConfirmId, setExpiryConfirmId] = useState<string | null>(null);

  const availableStock = (productId: string) => {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return 0;
    const reserved = editingSale?.items.find((i) => i.productId === productId)?.qty ?? 0;
    return p.stock + reserved;
  };

  const list = useMemo(
    () =>
      db.products.filter(
        (p) =>
          p.active &&
          matchesCategory(db.categories, p.categoryId, cat) &&
          (!q || productSearchText(p).toLowerCase().includes(q.toLowerCase())),
      ),
    [db.products, db.categories, cat, q],
  );
  const visible = list.slice(0, visibleCount);
  const hasMore = list.length > visibleCount;
  const lines = cart.map((c) => ({ ...c, product: db.products.find((p) => p.id === c.productId)! })).filter((l) => l.product);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.product.salePrice, 0);
  const tax = db.settings.tax.enabled ? Math.round((subtotal * db.settings.tax.rate) / 100) : 0;
  const total = Math.max(0, subtotal + tax - discount);
  const selectedAccount = findAccount(db, accountId);
  const isCredit = selectedAccount?.type === "Credit";
  const change = isCredit ? 0 : Math.max(0, received - total);
  const itemCount = lines.reduce((a, l) => a + l.qty, 0);
  const isEditing = !!editingSale && !editingBlocked;

  useEffect(() => {
    if (!activeAccounts.some((a) => a.id === accountId) && activeAccounts[0]) setAccountId(activeAccounts[0].id);
  }, [activeAccounts, accountId]);

  useEffect(() => {
    setEditLoaded(false);
  }, [editId]);

  useEffect(() => {
    setVisibleCount(POS_PAGE_SIZE);
  }, [cat, q]);

  useEffect(() => {
    if (!editId) return;
    if (editingBlocked) {
      toast.error(!editingSale ? "Sale not found." : "This sale cannot be edited.");
      navigate({ to: "/pos", search: {}, replace: true });
      return;
    }
    if (!editingSale || editLoaded) return;
    setCart(editingSale.items.map((i) => ({ productId: i.productId, qty: i.qty })));
    setDiscount(editingSale.discount);
    setAccountId(editingSale.accountId);
    setCustomerId(editingSale.customerId ?? "walkin");
    skipReceivedSync.current = true;
    setReceived(editingSale.paid);
    setEditLoaded(true);
  }, [editId, editingSale, editingBlocked, editLoaded, navigate]);

  useEffect(() => {
    if (skipReceivedSync.current) {
      skipReceivedSync.current = false;
      return;
    }
    setReceived(isCredit ? 0 : total);
  }, [total, isCredit]);

  const add = (id: string, confirmedExpired = false) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) return;
    const stock = availableStock(id);
    const inCart = cart.find((c) => c.productId === id)?.qty ?? 0;
    if (stock <= inCart) {
      toast.error(stock <= 0 ? `${p.name} is out of stock.` : `Only ${stock} in stock.`);
      return;
    }
    const shelf = expiryStatus(p.expiryDate);
    if (shelf === "expired" && !confirmedExpired && inCart === 0) {
      setExpiryConfirmId(id);
      return;
    }
    if (shelf === "soon" && inCart === 0) toast.warning(`${p.name} ${expiryPhrase(p.expiryDate).toLowerCase()}.`);
    if (stock - inCart - 1 <= p.minStock && stock - inCart - 1 >= 0) toast.warning(`${p.name} is running low (${stock - inCart - 1} left after this).`);
    setCart((c) => (inCart ? c.map((x) => (x.productId === id ? { ...x, qty: x.qty + 1 } : x)) : [...c, { productId: id, qty: 1 }]));
  };
  const setQty = (id: string, qty: number) => {
    const stock = availableStock(id);
    if (qty > stock) {
      toast.error(`Only ${stock} in stock.`);
      return;
    }
    setCart((c) => (qty <= 0 ? c.filter((x) => x.productId !== id) : c.map((x) => (x.productId === id ? { ...x, qty } : x))));
  };
  const clear = () => { setCart([]); setDiscount(0); setReceived(0); setCustomerId("walkin"); setAccountId(defaultAccountId); };

  const cancelEdit = () => {
    clear();
    setEditLoaded(false);
    navigate({ to: "/sales/$id", params: { id: editId! } });
  };

  const scan = () => {
    const p = db.products.find((x) => x.barcode === barcode.trim() || x.sku.toLowerCase() === barcode.trim().toLowerCase());
    if (!p) toast.error("No product found for this barcode.");
    else add(p.id);
    setBarcode("");
  };

  const complete = () => {
    if (!lines.length) {
      toast.error("Cart is empty. Add products first.");
      return;
    }
    if (isCredit && customerId === "walkin") {
      toast.error("Select a customer for credit sale.");
      return;
    }
    const paidAmt = isCredit ? received : received || total;
    if (!isCredit && paidAmt < total) {
      toast.error("Amount received is less than total. Use Credit for partial payment.");
      return;
    }
    const payload = {
      customerId: customerId === "walkin" ? null : customerId, discount, accountId, received: paidAmt,
      items: lines.map((l) => ({ productId: l.productId, name: l.product.name, qty: l.qty, price: l.product.salePrice, cost: l.product.purchasePrice })),
    };
    if (isEditing && editingSale) {
      const sale = actions.updateSale(editingSale.id, payload);
      if (!sale) {
        toast.error("Could not update sale. Check stock and try again.");
        return;
      }
      clear();
      setEditLoaded(false);
      toast.success(`Sale ${sale.invoiceNo} updated.`);
      navigate({ to: "/sales/$id", params: { id: sale.id } });
      return;
    }
    const sale = actions.completeSale(payload);
    setDone(sale);
    clear();
    toast.success(`Sale ${sale.invoiceNo} completed.`);
  };

  const hold = () => {
    if (isEditing) {
      toast.error("Cannot hold while editing a sale.");
      return;
    }
    if (!lines.length) {
      toast.error("Nothing to hold.");
      return;
    }
    actions.holdSale({ customerId: customerId === "walkin" ? null : customerId, items: cart, discount });
    clear();
    toast.success("Sale put on hold.");
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.querySelector("input")?.focus(); }
      if (e.key === "F4") { e.preventDefault(); barcodeRef.current?.focus(); }
      if (e.key === "F9") { e.preventDefault(); complete(); }
      if (e.key === "F8") { e.preventDefault(); hold(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  useEffect(() => {
    const el = cartRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setCartInView(!!entry?.isIntersecting),
      { threshold: 0.2, rootMargin: "0px 0px -72px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const customer = (id: string | null) => db.customers.find((c) => c.id === id);
  const customerName = (id: string | null) => customer(id)?.name;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <div className="min-w-0 space-y-3">
        {isEditing && editingSale && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-medium"><Pencil className="size-4 text-primary" />Editing invoice <span className="font-semibold text-primary">{editingSale.invoiceNo}</span></p>
            <Button variant="outline" size="sm" onClick={cancelEdit}><X className="size-4" />Cancel edit</Button>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div ref={searchRef} className="flex-1"><SearchInput autoFocus value={q} onChange={setQ} placeholder="Search name, size, gender or brand (F2)" /></div>
          
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {[{ id: "all", name: "All" }, ...parentCategories(db.categories)].map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", cat === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{c.name}</button>
          ))}
        </div>
        {list.length === 0 ? <Card><EmptyState title="No products found." description="Try a different search or category." /></Card> : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const stock = availableStock(p.id);
                const out = stock <= 0;
                const low = !out && stock <= p.minStock;
                const shelf = expiryStatus(p.expiryDate);
                const variant = productVariantLabel(p);
                return (
                  <button key={p.id} disabled={out} onClick={() => add(p.id)} className={cn("group flex flex-col rounded-lg border bg-card p-3 text-left transition-colors", out ? "cursor-not-allowed opacity-55" : "hover:border-primary")}>
                    <div className="flex items-start justify-between gap-2">
                      <ProductThumb product={p} />
                      {out ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Out of stock</span> : shelf === "expired" ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Expired</span> : low ? <span className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning"><AlertTriangle className="size-3" />Low</span> : shelf === "soon" ? <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Expiring</span> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-5">{p.name}</p>
                    <p className={cn("line-clamp-1 min-h-4 text-xs", variant ? "text-muted-foreground" : "invisible")}>{variant || "—"}</p>
                    <div className="mt-1 flex items-end justify-between">
                      <span className="font-bold text-primary">{rs(p.salePrice)}</span>
                      <span className="text-xs text-muted-foreground">{qtyWithUnit(stock, p.unit)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + POS_PAGE_SIZE)}>
                  Show more ({list.length - visibleCount} left)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Card id="cart" ref={cartRef} className="h-fit scroll-mt-16 gap-0 py-0 shadow-none lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-2 border-b p-2">
          <p className="flex items-center gap-2 font-semibold"><ShoppingCart className="size-4" />Cart <span className="rounded-full bg-muted px-2 text-xs">{itemCount}</span></p>
          <div className="flex items-center gap-1">
            {cart.length > 0 && !isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={hold}><PauseCircle className="size-4" />Hold (F8)</Button>
                <Button variant="outline" size="sm" onClick={clear} className="text-destructive hover:text-destructive"><Trash2 className="size-4" />Clear</Button>
              </>
            )}
            {cart.length > 0 && isEditing && (
              <Button variant="outline" size="sm" onClick={clear} className="text-destructive hover:text-destructive"><Trash2 className="size-4" />Clear</Button>
            )}
            {!isEditing && db.held.length > 0 && (
              <Popover>
                <PopoverTrigger asChild><Button variant="ghost" size="sm"><PauseCircle className="size-4" />Held ({db.held.length})</Button></PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-2">
                  {db.held.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-muted">
                      <div className="flex-1 text-sm"><p className="font-medium">{customerName(h.customerId) ?? "Walk-in"}</p><p className="text-xs text-muted-foreground">{h.items.length} items · {fmtTime(h.date)}</p></div>
                      <Button size="sm" variant="outline" onClick={() => { setCart(h.items); setDiscount(h.discount); setCustomerId(h.customerId ?? "walkin"); actions.removeHeld(h.id); toast.success("Held sale resumed."); }}>Resume</Button>
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => actions.removeHeld(h.id)} aria-label="Remove held sale"><X className="size-4" /></Button>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
        <div className="border-b p-2">
          <CustomerPicker value={customerId} customers={db.customers} onChange={setCustomerId} />
        </div>
        <div className="max-h-[calc(3*3.5rem)] min-h-[120px] overflow-y-auto">
          {lines.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Cart is empty. Tap a product or scan a barcode.</p> : lines.map((l) => (
            <div key={l.productId} className="flex h-14 items-center gap-2 border-b px-2">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{l.product.name}</p><p className="truncate text-xs text-muted-foreground">{[productVariantLabel(l.product), `${rs(l.product.salePrice)} × ${l.qty}`].filter(Boolean).join(" · ")}</p></div>
              <div className="flex items-center rounded-md border">
                <button className="grid size-7 place-items-center hover:bg-muted" onClick={() => setQty(l.productId, l.qty - 1)} aria-label="Decrease"><Minus className="size-3" /></button>
                <input value={l.qty} onChange={(e) => setQty(l.productId, Number(e.target.value) || 0)} className="w-8 bg-transparent text-center text-sm outline-none" aria-label="Quantity" />
                <button className="grid size-7 place-items-center hover:bg-muted" onClick={() => setQty(l.productId, l.qty + 1)} aria-label="Increase"><Plus className="size-3" /></button>
              </div>
              <p className="w-20 text-right text-sm font-semibold">{rs(l.qty * l.product.salePrice)}</p>
              <button onClick={() => setQty(l.productId, 0)} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <div className="space-y-1 border-b p-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rs(subtotal)}</span></div>
          {tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax ({db.settings.tax.rate}%)</span><span>{rs(tax)}</span></div>}
          <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Discount</span><CurrencyInput value={discount} onChange={setDiscount} className="w-32" /></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">{rs(total)}</span></div>
        </div>
        <div className="space-y-2 p-2">
          <div className={cn("grid gap-1.5", activeAccounts.length <= 6 ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6")}>
            {activeAccounts.map((a) => {
              const I = TYPE_ICON[a.type];
              return (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-0.5 py-2 text-[10px] font-medium leading-tight",
                    accountId === a.id ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  <I className="size-4 shrink-0" />
                  <span className="line-clamp-2 text-center">{a.name}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><p className="mb-1 text-xs text-muted-foreground">{isCredit ? "Paid now" : "Amount received"}</p><CurrencyInput value={received} onChange={setReceived} placeholder={String(total)} /></div>
            <div><p className="mb-1 text-xs text-muted-foreground">{isCredit ? "Due" : "Change"}</p><div className="flex h-9 items-center rounded-md border bg-muted px-3 font-semibold">{isCredit ? rs(Math.max(0, total - received)) : rs(change)}</div></div>
          </div>
          <Button className="h-12 w-full text-base" onClick={complete}>
            {isEditing ? <><Pencil className="size-5" />Update Sale · {rs(total)}</> : <><CheckCircle2 className="size-5" />Complete Sale · {rs(total)}</>}
          </Button>
        </div>
      </Card>

      {lines.length > 0 && !cartInView && (
        <a href="#cart" className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg lg:hidden">
          <span>View cart ({itemCount})</span><span>{rs(total)}</span>
        </a>
      )}

      <Dialog open={!!done} onOpenChange={(o) => { if (!o) { setDone(null); setShowReceipt(false); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {done && (
            <>
              {showReceipt && (
                <Button variant="ghost" size="sm" className="absolute left-3 top-3.5 z-10" onClick={() => setShowReceipt(false)}>
                  <ArrowLeft className="size-4" />Back
                </Button>
              )}
              <DialogHeader className="items-center text-center">
                <div className="mb-1 grid size-12 place-items-center rounded-full bg-success/10 text-success"><CheckCircle2 className="size-6" /></div>
                <DialogTitle>Sale completed</DialogTitle>
                <p className="text-sm text-muted-foreground">Invoice {done.invoiceNo}</p>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center">
                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-bold">{rs(done.total)}</p></div>
                <div><p className="text-xs text-muted-foreground">Paid</p><p className="font-bold">{rs(done.paid)}</p></div>
                <div><p className="text-xs text-muted-foreground">{done.total > done.paid ? "Due" : "Change"}</p><p className="font-bold text-primary">{rs(done.total > done.paid ? done.total - done.paid : done.change)}</p></div>
              </div>
              {showReceipt && <InvoicePreview sale={done} settings={db.settings} customerName={customerName(done.customerId) ?? "Walk-in"} showActions={false} />}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => { setShowReceipt(true); setTimeout(() => window.print(), 100); }}><Printer className="size-4" />Print</Button>
                <Button
                  variant="outline"
                  onClick={() => downloadInvoicePdf(done, db.settings, customerName(done.customerId) ?? "Walk-in")}
                >
                  <FileText className="size-4" />PDF
                </Button>
                <Button onClick={() => { setDone(null); setShowReceipt(false); }}><Plus className="size-4" />New Sale</Button>
              </div>
              {!showReceipt && <button className="text-sm font-medium text-primary" onClick={() => setShowReceipt(true)}>Preview receipt</button>}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!expiryConfirmId}
        onOpenChange={(o) => { if (!o) setExpiryConfirmId(null); }}
        title="This product is expired"
        description={(() => {
          const p = db.products.find((x) => x.id === expiryConfirmId);
          if (!p) return "This item is past its expiry date. Add it to the cart only if you mean to sell it.";
          const when = p.expiryDate ? ` on ${fmtExpiry(p.expiryDate)} (${expiryPhrase(p.expiryDate).toLowerCase()})` : "";
          return `${p.name} is past its expiry date${when}. Add it to the cart only if you mean to sell it.`;
        })()}
        confirmText="Sell anyway"
        onConfirm={() => {
          const id = expiryConfirmId;
          setExpiryConfirmId(null);
          if (id) add(id, true);
        }}
      />
    </div>
  );
}

function CustomerPicker({ value, customers, onChange }: { value: string; customers: Customer[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = value === "walkin" ? null : customers.find((c) => c.id === value);
  const display = open ? query : selected ? (selected.phone ? `${selected.name} · ${selected.phone}` : selected.name) : "Walk-in customer";
  const q = query.trim();
  const { filtered, filteredTotal } = useMemo(() => {
    const list = !q
      ? customers
      : customers.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
    return { filtered: list.slice(0, CUSTOMER_PICKER_LIMIT), filteredTotal: list.length };
  }, [customers, q]);
  const exactMatch = customers.some((c) => c.name.toLowerCase() === q.toLowerCase());
  const canCreate = q.length > 0 && !exactMatch;
  const showWalkIn = !q || "walk-in customer".includes(q.toLowerCase());
  const moreCustomers = filteredTotal > filtered.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const create = () => {
    const name = q;
    const exists = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      select(exists.id);
      toast.success(`${exists.name} already exists — selected.`);
      return;
    }
    const id = actions.saveCustomer({ name, phone: "", email: "", address: "", city: "" });
    select(id);
    toast.success(`${name} added.`);
  };

  const openPicker = () => {
    if (!open) {
      setOpen(true);
      setQuery("");
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        value={display}
        placeholder="Walk-in customer"
        className="bg-card pr-9"
        onFocus={openPicker}
        onClick={openPicker}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length === 1) select(filtered[0]!.id);
            else if (canCreate) create();
            else if (showWalkIn && !q) select("walkin");
          }
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            inputRef.current?.blur();
          }
        }}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>{canCreate ? null : "No customer found."}</CommandEmpty>
              <CommandGroup>
                {showWalkIn && (
                  <CommandItem value="walkin" onSelect={() => select("walkin")}>
                    <Check className={cn("size-4", value === "walkin" ? "opacity-100" : "opacity-0")} />
                    Walk-in customer
                  </CommandItem>
                )}
                {filtered.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => select(c.id)}>
                    <Check className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{c.phone ? `${c.name} · ${c.phone}` : c.name}</span>
                  </CommandItem>
                ))}
                {moreCustomers && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Type to narrow · showing {filtered.length} of {filteredTotal}</p>
                )}
                {canCreate && (
                  <CommandItem value={`create-${q}`} onSelect={create} className="text-primary">
                    <Plus className="size-4" />
                    Create “{q}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
