import { Download, Printer, Share2 } from "lucide-react";
import { shopLogoUrl } from "@/lib/branding";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtDateTime, rs } from "@/lib/format";
import type { Sale, Settings } from "@/lib/mock-data";

function invoiceCaption(sale: Sale, shopName: string) {
  return `${shopName}\nInvoice ${sale.invoiceNo}\nTotal: ${rs(sale.total)}\nPaid: ${rs(sale.paid)}\nThank you for shopping with us!`;
}

function waPhone(phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `92${digits.slice(1)}` : digits.startsWith("92") ? digits : digits;
}

function openWhatsApp(text: string, phone?: string) {
  const phoneParam = waPhone(phone);
  const url = phoneParam
    ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Receipt-style PDF matching the on-screen invoice form (80mm wide). */
export function buildInvoicePdf(sale: Sale, settings: Settings, customerName?: string) {
  const { shop, invoice } = settings;
  const pageW = 80;
  const margin = 5;
  const contentW = pageW - margin * 2;

  // Measure content height on a tall scratch page, then render onto a fitted page.
  const measure = new jsPDF({ unit: "mm", format: [pageW, 400], orientation: "portrait" });
  const pageH = Math.max(drawInvoice(measure, sale, shop, invoice, customerName, pageW, margin, contentW) + 6, 70);
  const doc = new jsPDF({ unit: "mm", format: [pageW, pageH], orientation: "portrait" });
  drawInvoice(doc, sale, shop, invoice, customerName, pageW, margin, contentW);
  return doc;
}

function drawInvoice(
  doc: jsPDF,
  sale: Sale,
  shop: Settings["shop"],
  invoice: Settings["invoice"],
  customerName: string | undefined,
  pageW: number,
  margin: number,
  contentW: number,
) {
  let y = 6;
  const center = (text: string, size = 8, style: "normal" | "bold" = "normal") => {
    doc.setFont("courier", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentW) as string[];
    for (const line of lines) {
      doc.text(line, pageW / 2, y, { align: "center" });
      y += size * 0.45 + 1.1;
    }
  };
  const row = (left: string, right: string, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.text(left, margin, y);
    doc.text(right, pageW - margin, y, { align: "right" });
    y += 4;
  };
  const dashed = () => {
    doc.setDrawColor(120);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineDashPattern([], 0);
    y += 3.5;
  };

  if (invoice.showLogo) {
    doc.setDrawColor(80);
    doc.circle(pageW / 2, y + 4, 4.5);
    y += 11;
  }
  center(shop.name, 11, "bold");
  if (invoice.showPhone && shop.phone) center(shop.phone, 8);
  if (invoice.showAddress) center([shop.address, shop.city].filter(Boolean).join(", "), 7);
  dashed();
  row("Invoice", sale.invoiceNo);
  row("Date", fmtDateTime(sale.date));
  row("Cashier", sale.cashier);
  row("Customer", customerName ?? "Walk-in");
  dashed();

  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("Item", margin, y);
  doc.text("Qty", margin + 38, y, { align: "right" });
  doc.text("Price", margin + 52, y, { align: "right" });
  doc.text("Total", pageW - margin, y, { align: "right" });
  y += 4;

  doc.setFont("courier", "normal");
  for (const item of sale.items) {
    const nameLines = doc.splitTextToSize(item.name, 34) as string[];
    doc.text(nameLines[0] || item.name, margin, y);
    doc.text(String(item.qty), margin + 38, y, { align: "right" });
    doc.text(item.price.toLocaleString(), margin + 52, y, { align: "right" });
    doc.text((item.qty * item.price).toLocaleString(), pageW - margin, y, { align: "right" });
    y += 3.8;
    for (let i = 1; i < nameLines.length; i++) {
      const line = nameLines[i];
      if (line) {
        doc.text(line, margin, y);
        y += 3.5;
      }
    }
  }

  dashed();
  row("Subtotal", rs(sale.subtotal));
  row("Discount", rs(sale.discount));
  row("Grand Total", rs(sale.total), true);
  row("Paid", rs(sale.paid));
  row("Due", rs(Math.max(0, sale.total - sale.paid)));
  row("Change", rs(sale.change));
  row("Payment", sale.method);
  dashed();
  center(invoice.footer || "Thank you for shopping with us!", 8, "bold");
  if (invoice.terms) {
    y += 0.5;
    center(invoice.terms, 6.5);
  }
  return y;
}

export function invoicePdfBlob(sale: Sale, settings: Settings, customerName?: string) {
  return buildInvoicePdf(sale, settings, customerName).output("blob");
}

export function downloadInvoicePdf(sale: Sale, settings: Settings, customerName?: string) {
  downloadBlob(invoicePdfBlob(sale, settings, customerName), `${sale.invoiceNo}.pdf`);
  toast.success("Invoice PDF downloaded.");
}

export async function shareInvoice(sale: Sale, settings: Settings, customerName?: string) {
  const blob = invoicePdfBlob(sale, settings, customerName);
  const file = new File([blob], `${sale.invoiceNo}.pdf`, { type: "application/pdf" });
  const text = invoiceCaption(sale, settings.shop.name);
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: sale.invoiceNo, text });
      return;
    } catch {
      /* cancelled — fall through */
    }
  }
  downloadBlob(blob, `${sale.invoiceNo}.pdf`);
  toast.success("Invoice PDF downloaded. Attach it when sharing.");
}

/**
 * Shares invoice as PDF via WhatsApp.
 * Mobile: system share sheet with PDF (pick WhatsApp).
 * Desktop: downloads PDF + opens WhatsApp with caption (attach the file manually).
 */
export async function shareViaWhatsApp(
  sale: Sale,
  settings: Settings,
  phone?: string,
  customerName?: string,
) {
  const blob = invoicePdfBlob(sale, settings, customerName);
  const file = new File([blob], `${sale.invoiceNo}.pdf`, { type: "application/pdf" });
  const caption = invoiceCaption(sale, settings.shop.name);

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: sale.invoiceNo, text: caption });
      toast.success("Choose WhatsApp to send the invoice PDF.");
      return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
    }
  }

  downloadBlob(blob, `${sale.invoiceNo}.pdf`);
  toast.success("Invoice PDF downloaded — attach it in WhatsApp.");
  openWhatsApp(`Invoice ${sale.invoiceNo} (PDF attached).\n${caption}`, phone);
}

export function InvoicePreview({ sale, settings, customerName, showActions = true }: { sale: Sale; settings: Settings; customerName?: string; showActions?: boolean }) {
  const { shop, invoice } = settings;
  const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => (
    <div className={`flex justify-between ${b ? "text-sm font-bold" : ""}`}><span>{l}</span><span>{v}</span></div>
  );
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="print-area w-full max-w-[300px] rounded-md border bg-card p-4 font-mono text-[11px] leading-relaxed text-card-foreground shadow-sm">
        <div className="text-center">
          {invoice.showLogo && (
            <div className="mx-auto mb-1 grid size-9 place-items-center rounded-full border">
              <img src={shopLogoUrl(shop.logo)} alt="" className="size-9 rounded-full object-cover" />
            </div>
          )}
          <p className="text-sm font-bold">{shop.name}</p>
          {invoice.showPhone && <p>{shop.phone}</p>}
          {invoice.showAddress && <p>{shop.address}, {shop.city}</p>}
        </div>
        <div className="my-2 border-t border-dashed" />
        <Row l="Invoice" v={sale.invoiceNo} />
        <Row l="Date" v={fmtDateTime(sale.date)} />
        <Row l="Cashier" v={sale.cashier} />
        <Row l="Customer" v={customerName ?? "Walk-in"} />
        <div className="my-2 border-t border-dashed" />
        <div className="grid grid-cols-[1fr_28px_56px_60px] font-bold"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span></div>
        {sale.items.map((i) => (
          <div key={i.productId} className="grid grid-cols-[1fr_28px_56px_60px]">
            <span className="truncate pr-1">{i.name}</span><span className="text-right">{i.qty}</span>
            <span className="text-right">{i.price.toLocaleString()}</span><span className="text-right">{(i.qty * i.price).toLocaleString()}</span>
          </div>
        ))}
        <div className="my-2 border-t border-dashed" />
        <Row l="Subtotal" v={rs(sale.subtotal)} />
        <Row l="Discount" v={rs(sale.discount)} />
        <Row l="Grand Total" v={rs(sale.total)} b />
        <Row l="Paid" v={rs(sale.paid)} />
        <Row l="Due" v={rs(Math.max(0, sale.total - sale.paid))} />
        <Row l="Change" v={rs(sale.change)} />
        <Row l="Payment" v={sale.method} />
        <div className="my-2 border-t border-dashed" />
        <p className="text-center font-bold">{invoice.footer || "Thank you for shopping with us!"}</p>
        {invoice.terms && <p className="mt-1 text-center text-[10px] opacity-70">{invoice.terms}</p>}
      </div>
      {showActions && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
          <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(sale, settings, customerName)}><Download className="size-4" />Download PDF</Button>
          <Button size="sm" variant="outline" onClick={() => shareInvoice(sale, settings, customerName)}><Share2 className="size-4" />Share</Button>
        </div>
      )}
    </div>
  );
}
