import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer, Upload, Wifi } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, SimpleSelect, StatusBadge } from "@/components/shared";
import { InvoicePreview } from "@/components/invoice-preview";
import { pageHead, rs, fmtDateTime } from "@/lib/format";
import { useDB, actions } from "@/lib/store";
import { accountIdOf, BRAND_THEMES, type BrandTheme, type Sale } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { compressLogoFile } from "@/lib/image-compress";
import { applyShopFavicon } from "@/lib/branding";

export const Route = createFileRoute("/_app/settings/shop")({
  head: pageHead("Settings: shop", "Shop profile, invoice, tax and printer settings."),
  component: ShopSettingsPage,
});

const PAPER_SIZES: Record<"Thermal" | "A4", string[]> = {
  Thermal: ["58mm Roll", "80mm Roll"],
  A4: ["A4", "A5"],
};

/** Used for the live invoice preview when the shop has no sales yet. */
const PREVIEW_SALE: Sale = {
  id: "preview",
  invoiceNo: "INV-1001",
  date: new Date().toISOString(),
  customerId: null,
  items: [{ productId: "sample", name: "Sample Item", qty: 1, price: 500, cost: 300 }],
  discount: 0,
  subtotal: 500,
  total: 500,
  paid: 500,
  change: 0,
  method: "Cash",
  accountId: accountIdOf("Cash"),
  status: "Paid",
  cashier: "Owner",
  notes: "",
  payments: [],
};

function ShopSettingsPage() {
  const db = useDB();
  const [shop, setShop] = useState(db.settings.shop);
  const [tax, setTax] = useState(db.settings.tax);
  const [invoice, setInvoice] = useState(db.settings.invoice);
  const [printer, setPrinter] = useState(db.settings.printer);
  const [branding, setBranding] = useState(db.settings.branding);
  const [testOpen, setTestOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "phone" | "email", string>>>({});

  const sampleSale = db.sales[0] ?? PREVIEW_SALE;
  const previewSettings = { ...db.settings, shop, tax, invoice, printer, branding };
  const customerName = sampleSale.customerId ? db.customers.find((c) => c.id === sampleSale.customerId)?.name : "Walk-in";

  useEffect(() => {
    applyShopFavicon(shop.logo);
    return () => applyShopFavicon(db.settings.shop.logo);
  }, [shop.logo, db.settings.shop.logo]);

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const logo = await compressLogoFile(file);
      setShop((s) => ({ ...s, logo }));
      toast.success("Logo updated — save to apply everywhere.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload logo.");
    }
    e.target.value = "";
  };

  const selectTheme = (theme: BrandTheme) => {
    setBranding({ theme });
    document.documentElement.setAttribute("data-brand", theme);
  };

  const save = () => {
    const errs: Record<string, string> = {};
    if (!shop.name.trim()) errs.name = "Shop name is required.";
    if (!shop.phone.trim()) errs.phone = "Phone number is required.";
    if (shop.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shop.email)) errs.email = "Enter a valid email address.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    actions.updateSettings("shop", shop);
    actions.updateSettings("tax", tax);
    actions.updateSettings("invoice", invoice);
    actions.updateSettings("printer", printer);
    actions.updateSettings("branding", branding);
    toast.success("Shop settings saved.");
  };

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Shop Name" error={errors.name} className="sm:col-span-2">
              <Input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} className="bg-card" />
            </Field>
            <Field label="Owner Name">
              <Input value={db.currentUser} disabled className="bg-muted" />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} className="bg-card" />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input value={shop.email} onChange={(e) => setShop({ ...shop, email: e.target.value })} className="bg-card" />
            </Field>
            <Field label="City">
              <Input value={shop.city} onChange={(e) => setShop({ ...shop, city: e.target.value })} className="bg-card" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} className="bg-card" rows={2} />
            </Field>
            <Field label="Currency">
              <SimpleSelect value={shop.currency} onChange={(v) => setShop({ ...shop, currency: v })} options={[{ value: "PKR", label: "PKR — Pakistani Rupee" }]} />
            </Field>
            <Field label="Brand Color" className="sm:col-span-2">
              <div className="grid grid-cols-3 gap-3">
                {BRAND_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTheme(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors",
                      branding.theme === t.id ? "border-primary bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <span className="size-8 rounded-full border shadow-sm" style={{ backgroundColor: t.swatch }} />
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Applies to sidebar highlights and buttons.</p>
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center gap-3 p-5">
              {shop.logo ? (
                <img src={shop.logo} alt={shop.name} className="size-20 rounded-full object-contain bg-transparent" />
              ) : (
                <AppLogo className="h-20 w-auto max-w-[160px]" tone="dark" />
              )}
              <p className="text-xs text-muted-foreground">
                {shop.logo
                  ? "Custom logo — used in sidebar, browser tab, and invoices."
                  : "Default Dukan on Click logo — upload to replace."}
              </p>
              <label className="w-full">
                <Input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent">
                  <Upload className="size-4" />Upload Logo
                </span>
              </label>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable Tax</p>
                  <p className="text-xs text-muted-foreground">Apply tax on sales invoices.</p>
                </div>
                <Switch checked={tax.enabled} onCheckedChange={(v) => setTax({ ...tax, enabled: v })} />
              </div>
              {tax.enabled && (
                <Field label="Tax Rate (%)">
                  <Input type="number" min={0} value={tax.rate} onChange={(e) => setTax({ ...tax, rate: Number(e.target.value) || 0 })} className="bg-card" />
                </Field>
              )}
              <Field label="Tax / NTN Number">
                <Input value={shop.taxNumber} onChange={(e) => setShop({ ...shop, taxNumber: e.target.value })} className="bg-card" />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-semibold">Invoice Settings</p>
              <p className="text-xs text-muted-foreground">Invoice numbering, layout and messaging.</p>
            </div>
            <Field label="Invoice Prefix">
              <Input value={invoice.prefix} onChange={(e) => setInvoice({ ...invoice, prefix: e.target.value.toUpperCase() })} className="bg-card" />
            </Field>
            <Field label="Starting Invoice Number">
              <Input type="number" min={1} value={invoice.startNumber} onChange={(e) => setInvoice({ ...invoice, startNumber: Number(e.target.value) || 1 })} className="bg-card" />
            </Field>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <p className="text-sm font-medium">Show Logo on Invoice</p>
              <Switch checked={invoice.showLogo} onCheckedChange={(v) => setInvoice({ ...invoice, showLogo: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <p className="text-sm font-medium">Show Customer Phone</p>
              <Switch checked={invoice.showPhone} onCheckedChange={(v) => setInvoice({ ...invoice, showPhone: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <p className="text-sm font-medium">Show Shop Address</p>
              <Switch checked={invoice.showAddress} onCheckedChange={(v) => setInvoice({ ...invoice, showAddress: v })} />
            </div>
            <Field label="Footer Message" className="sm:col-span-2">
              <Textarea rows={2} value={invoice.footer} onChange={(e) => setInvoice({ ...invoice, footer: e.target.value })} className="bg-card" />
            </Field>
            <Field label="Terms & Conditions" className="sm:col-span-2">
              <Textarea rows={3} value={invoice.terms} onChange={(e) => setInvoice({ ...invoice, terms: e.target.value })} className="bg-card" />
            </Field>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="mb-3 text-sm font-semibold">Live Preview</p>
            <InvoicePreview sale={sampleSale} settings={previewSettings} customerName={customerName} showActions={false} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardContent className="space-y-5 p-5">
            <div>
              <p className="text-sm font-semibold">Printer Settings</p>
              <p className="text-xs text-muted-foreground">Receipt printer type, paper size, and print behaviour.</p>
            </div>
            <Field label="Printer Type">
              <RadioGroup value={printer.type} onValueChange={(v: "Thermal" | "A4") => setPrinter({ ...printer, type: v, paperSize: PAPER_SIZES[v][0] ?? "", width: v === "Thermal" ? "80mm" : printer.width })} className="grid grid-cols-2 gap-3">
                {(["Thermal", "A4"] as const).map((t) => (
                  <label key={t} className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 ${printer.type === t ? "border-primary bg-accent" : ""}`}>
                    <RadioGroupItem value={t} />
                    <div>
                      <p className="text-sm font-medium">{t}</p>
                      <p className="text-xs text-muted-foreground">{t === "Thermal" ? "Receipt-style printer" : "Standard paper printer"}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </Field>
            <Field label="Paper Size">
              <SimpleSelect value={printer.paperSize} onChange={(v) => setPrinter({ ...printer, paperSize: v })} options={PAPER_SIZES[printer.type]} />
            </Field>
            {printer.type === "Thermal" && (
              <Field label="Receipt Width">
                <RadioGroup value={printer.width} onValueChange={(v: "58mm" | "80mm") => setPrinter({ ...printer, width: v })} className="flex gap-3">
                  {(["58mm", "80mm"] as const).map((w) => (
                    <label key={w} className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 ${printer.width === w ? "border-primary bg-accent" : ""}`}>
                      <RadioGroupItem value={w} /><span className="text-sm">{w}</span>
                    </label>
                  ))}
                </RadioGroup>
              </Field>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Auto Print After Sale</p>
                <p className="text-xs text-muted-foreground">Automatically print receipt when a sale completes.</p>
              </div>
              <Switch checked={printer.autoPrint} onCheckedChange={(v) => setPrinter({ ...printer, autoPrint: v })} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Connection Status</p>
              <StatusBadge status={printer.connected ? "Connected" : "Inactive"} />
            </div>
            <div className="flex items-center gap-3 rounded-md border p-3 text-sm text-muted-foreground">
              <Wifi className="size-4 shrink-0" />
              {printer.connected ? "Printer is online and ready." : "No printer detected. Check your connection."}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setTestOpen(true)}><Printer className="size-4" />Test Print</Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save}>Save Changes</Button>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Test Receipt</DialogTitle></DialogHeader>
          <div className="print-area rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed">
            <p className="text-center text-sm font-bold">{shop.name}</p>
            <p className="text-center">{shop.phone}</p>
            <div className="my-2 border-t border-dashed" />
            <p>Test Print — {fmtDateTime(new Date().toISOString())}</p>
            <p>Printer: {printer.type} ({printer.width})</p>
            <div className="my-2 border-t border-dashed" />
            <div className="flex justify-between"><span>Sample Item</span><span>{rs(500)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{rs(500)}</span></div>
            <div className="my-2 border-t border-dashed" />
            <p className="text-center">Printer configuration OK</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button>
            <Button onClick={() => { window.print(); toast.success("Sent to printer."); }}><Printer className="size-4" />Print Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
