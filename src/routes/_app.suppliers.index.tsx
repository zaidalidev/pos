import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Eye, FileText, HandCoins, MoreHorizontal, Package, Pencil, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, StatCard, useFakeLoading, type Column } from "@/components/shared";
import { PaymentDialog } from "@/components/payment-dialog";
import { actions, supplierStats, useDB } from "@/lib/store";
import { pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import type { Supplier } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/suppliers/")({
  head: pageHead("Suppliers", "Suppliers, purchase history and balances."),
  component: SuppliersPage,
});

type Form = { name: string; contact: string; phone: string; address: string; city: string };
const empty: Form = { name: "", contact: "", phone: "", address: "", city: "" };

function SuppliersPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<Supplier | null>(null);
  const [pay, setPay] = useState<Supplier | null>(null);

  const rows = useMemo(() => db.suppliers.filter((s) =>
    !q || `${s.name} ${s.contact} ${s.phone} ${s.city}`.toLowerCase().includes(q.toLowerCase())
  ), [db, q]);

  const totals = useMemo(() => {
    const stats = db.suppliers.map((s) => supplierStats(db, s.id));
    return { purchases: stats.reduce((a, b) => a + b.total, 0), paid: stats.reduce((a, b) => a + b.paid, 0), due: stats.reduce((a, b) => a + b.due, 0) };
  }, [db]);

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!f.phone.trim()) e.phone = "Phone is required.";
    else if (!/^[0-9+\-\s]{7,15}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data);
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.saveSupplier({ ...dialog.data, id: dialog.id });
    toast.success(dialog.mode === "add" ? "Supplier added." : "Supplier updated.");
    setDialog(null);
    setQ("");
  };

  const cols: Column<Supplier>[] = [
    { key: "name", header: "Name", cell: (s) => <span className="font-semibold text-primary">{s.name}</span> },
    { key: "phone", header: "Phone", cell: (s) => s.phone },
    { key: "city", header: "City", cell: (s) => s.city },
    { key: "total", header: "Total purchases", cell: (s) => rs(supplierStats(db, s.id).total), className: "text-right" },
    { key: "paid", header: "Paid", cell: (s) => rs(supplierStats(db, s.id).paid), className: "text-right" },
    { key: "due", header: "Due", cell: (s) => { const d = supplierStats(db, s.id).due; return <span className={d ? "font-medium text-destructive" : ""}>{rs(d)}</span>; }, className: "text-right" },
    {
      key: "actions", header: "", className: "w-40 text-right", cell: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/products/new", search: { supplier: s.id } })}>
            <Plus className="size-3.5" />Add product
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate({ to: "/products/new", search: { supplier: s.id } })}><Package className="size-4" />Add product</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/suppliers/$id", params: { id: s.id } })}><Eye className="size-4" />View</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDialog({ mode: "edit", id: s.id, data: { name: s.name, contact: s.contact, phone: s.phone, address: s.address, city: s.city } }); setErrors({}); }}><Pencil className="size-4" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPay(s)}><HandCoins className="size-4" />Add payment</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDel(s)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "suppliers.pdf",
      title: "Suppliers",
      shopName: db.settings.shop.name,
      columns: [
        { key: "name", header: "Name", width: 40 },
        { key: "phone", header: "Phone", width: 28 },
        { key: "city", header: "City", width: 24 },
        { key: "total", header: "Total", align: "right", width: 26 },
        { key: "paid", header: "Paid", align: "right", width: 26 },
        { key: "due", header: "Due", align: "right", width: 26 },
      ],
      rows: rows.map((s) => {
        const st = supplierStats(db, s.id);
        return { name: s.name, phone: s.phone, city: s.city, total: rs(st.total), paid: rs(st.paid), due: rs(st.due) };
      }),
      summary: [
        { label: "Suppliers", value: String(rows.length) },
        { label: "Total due", value: rs(totals.due) },
      ],
    });
  };

  return (
    <div>
      <PageHeader title="Suppliers" description={`${rows.length} suppliers`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total suppliers" value={db.suppliers.length} icon={Truck} />
        <StatCard label="Total purchases" value={rs(totals.purchases)} icon={ShoppingBag} tone="info" />
        <StatCard label="Total paid" value={rs(totals.paid)} icon={HandCoins} tone="success" />
        <StatCard label="Total due" value={rs(totals.due)} icon={AlertCircle} tone="warning" />
      </div>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, phone or city" className="sm:w-72" />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button onClick={() => { setDialog({ mode: "add", data: empty }); setErrors({}); }}><Plus className="size-4" />Add Supplier</Button>
          </div>
        </FilterBar>
        <DataTable loading={loading} columns={cols} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => navigate({ to: "/suppliers/$id", params: { id: s.id } })}
          empty={
            <EmptyState
              icon={Truck}
              title={q ? "No suppliers match your search." : "No suppliers yet."}
              description={q ? "Try a different name, phone or city." : "Add your first supplier to start recording purchases."}
              action={!q ? <Button onClick={() => { setDialog({ mode: "add", data: empty }); setErrors({}); }}><Plus className="size-4" />Add Supplier</Button> : undefined}
            />
          } />
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "add" ? "Add Supplier" : "Edit Supplier"}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.name} className="sm:col-span-2"><Input autoFocus value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} /></Field>
              <Field label="Phone" error={errors.phone}><Input value={dialog.data.phone} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} /></Field>
              <Field label="City" error={errors.city}><Input value={dialog.data.city} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, city: e.target.value } })} /></Field>
              <Field label="Address" className="sm:col-span-2"><Textarea value={dialog.data.address} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, address: e.target.value } })} /></Field>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete supplier?" description={`This will permanently remove ${del?.name}. Their purchase history will remain.`}
        onConfirm={() => { if (del) { actions.deleteSupplier(del.id); toast.success("Supplier deleted."); } setDel(null); }} />

      {pay && <PaymentDialog open={!!pay} onOpenChange={(o) => !o && setPay(null)} title={`Add payment · ${pay.name}`} due={supplierStats(db, pay.id).due} onSubmit={(a, m) => actions.recordSupplierPayment(pay.id, a, m)} />}
    </div>
  );
}
