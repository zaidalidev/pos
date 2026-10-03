import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Eye, FileText, HandCoins, MoreHorizontal, Pencil, Plus, Receipt, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, SearchableSelect, StatCard, useFakeLoading, type Column } from "@/components/shared";
import { PaymentDialog } from "@/components/payment-dialog";
import { actions, customerStats, useDB } from "@/lib/store";
import { fmtDate, pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { CITIES, type Customer } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/customers/")({
  head: pageHead("Customers", "Customers, their purchase history and balances."),
  component: CustomersPage,
});

type Form = { name: string; phone: string; email: string; address: string; city: string };
const empty: Form = { name: "", phone: "", email: "", address: "", city: "" };

function CustomersPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<Customer | null>(null);
  const [pay, setPay] = useState<Customer | null>(null);

  const phones = useMemo(
    () => [...new Set(db.customers.map((c) => c.phone).filter(Boolean))].sort(),
    [db.customers],
  );
  const cityFilters = useMemo(
    () => [...new Set(db.customers.map((c) => c.city).filter(Boolean))].sort(),
    [db.customers],
  );
  const cityOptions = useMemo(() => {
    const fromData = db.customers.map((c) => c.city).filter(Boolean);
    return [...new Set([...CITIES, ...fromData])].sort();
  }, [db.customers]);

  const rows = useMemo(() => db.customers.filter((c) => {
    if (q && !`${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (phoneFilter !== "all" && c.phone !== phoneFilter) return false;
    if (cityFilter !== "all" && c.city !== cityFilter) return false;
    if (paidFilter !== "all") {
      const due = customerStats(db, c.id).due;
      if (paidFilter === "paid" && due > 0) return false;
      if (paidFilter === "unpaid" && due <= 0) return false;
    }
    return true;
  }), [db, q, phoneFilter, cityFilter, paidFilter]);

  const totals = useMemo(() => {
    const stats = db.customers.map((c) => customerStats(db, c.id));
    return { sales: stats.reduce((a, b) => a + b.total, 0), received: stats.reduce((a, b) => a + b.paid, 0), due: stats.reduce((a, b) => a + b.due, 0) };
  }, [db]);

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (f.phone.trim() && !/^[0-9+\-\s]{7,15}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email.";
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data);
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.saveCustomer({ ...dialog.data, ...(dialog.id ? { id: dialog.id } : {}) });
    toast.success(dialog.mode === "add" ? "Customer added." : "Customer updated.");
    setDialog(null);
    setQ("");
    setPhoneFilter("all");
    setCityFilter("all");
    setPaidFilter("all");
  };

  const cols: Column<Customer>[] = [
    { key: "name", header: "Name", cell: (c) => <span className="font-semibold text-primary">{c.name}</span> },
    { key: "phone", header: "Phone", cell: (c) => c.phone },
    { key: "city", header: "City", cell: (c) => c.city },
    { key: "total", header: "Total purchases", cell: (c) => rs(customerStats(db, c.id).total), className: "text-right" },
    { key: "paid", header: "Paid", cell: (c) => rs(customerStats(db, c.id).paid), className: "text-right" },
    { key: "due", header: "Due", cell: (c) => { const d = customerStats(db, c.id).due; return <span className={d ? "font-medium text-destructive" : ""}>{rs(d)}</span>; }, className: "text-right" },
    { key: "last", header: "Last purchase", cell: (c) => { const l = customerStats(db, c.id).last; return l ? fmtDate(l) : "—"; } },
    {
      key: "actions", header: "", className: "w-40 text-right", cell: (c) => {
        const dueAmt = customerStats(db, c.id).due;
        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" disabled={dueAmt <= 0} onClick={() => setPay(c)}>
              <HandCoins className="size-3.5" />Payment
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}><Eye className="size-4" />View</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setDialog({ mode: "edit", id: c.id, data: { name: c.name, phone: c.phone, email: c.email ?? "", address: c.address, city: c.city } }); setErrors({}); }}><Pencil className="size-4" />Edit</DropdownMenuItem>
                <DropdownMenuItem disabled={dueAmt <= 0} onClick={() => setPay(c)}><HandCoins className="size-4" />Add payment</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDel(c)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "customers.pdf",
      title: "Customers",
      shopName: db.settings.shop.name,
      columns: [
        { key: "name", header: "Name", width: 40 },
        { key: "phone", header: "Phone", width: 30 },
        { key: "city", header: "City", width: 28 },
        { key: "total", header: "Total", align: "right", width: 28 },
        { key: "paid", header: "Paid", align: "right", width: 28 },
        { key: "due", header: "Due", align: "right", width: 28 },
      ],
      rows: rows.map((c) => {
        const s = customerStats(db, c.id);
        return { name: c.name, phone: c.phone, city: c.city, total: rs(s.total), paid: rs(s.paid), due: rs(s.due) };
      }),
      summary: [
        { label: "Customers", value: String(rows.length) },
        { label: "Total due", value: rs(totals.due) },
      ],
    });
  };

  return (
    <div>
      <PageHeader title="Customers" description={`${rows.length} customers`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total customers" value={db.customers.length} icon={Users} />
        <StatCard label="Total sales" value={rs(totals.sales)} icon={Receipt} tone="info" />
        <StatCard label="Total received" value={rs(totals.received)} icon={HandCoins} tone="success" />
        <StatCard label="Total due" value={rs(totals.due)} icon={AlertCircle} tone="warning" />
      </div>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, phone or city" className="sm:w-56" />
          <SearchableSelect
            value={phoneFilter}
            onChange={setPhoneFilter}
            className="sm:w-44"
            placeholder="All phones"
            options={[{ value: "all", label: "All phones" }, ...phones.map((p) => ({ value: p, label: p }))]}
          />
          <SearchableSelect
            value={cityFilter}
            onChange={setCityFilter}
            className="sm:w-40"
            placeholder="All cities"
            options={[{ value: "all", label: "All cities" }, ...cityFilters.map((c) => ({ value: c, label: c }))]}
          />
          <SearchableSelect
            value={paidFilter}
            onChange={setPaidFilter}
            className="sm:w-36"
            placeholder="All statuses"
            options={[
              { value: "all", label: "All statuses" },
              { value: "paid", label: "Paid" },
              { value: "unpaid", label: "Unpaid" },
            ]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button onClick={() => { setDialog({ mode: "add", data: empty }); setErrors({}); }}><Plus className="size-4" />Add Customer</Button>
          </div>
        </FilterBar>
        <DataTable loading={loading} columns={cols} rows={rows} rowKey={(c) => c.id} pageSize={10} onRowClick={(c) => navigate({ to: "/customers/$id", params: { id: c.id } })}
          empty={
            <EmptyState
              icon={Users}
              title={q || phoneFilter !== "all" || cityFilter !== "all" || paidFilter !== "all" ? "No customers match your filters." : "No customers yet."}
              description={q || phoneFilter !== "all" || cityFilter !== "all" || paidFilter !== "all" ? "Try a different search or filter." : "Add your first customer to start tracking sales and balances."}
              action={!(q || phoneFilter !== "all" || cityFilter !== "all" || paidFilter !== "all") ? <Button onClick={() => { setDialog({ mode: "add", data: empty }); setErrors({}); }}><Plus className="size-4" />Add Customer</Button> : undefined}
            />
          } />
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "add" ? "Add Customer" : "Edit Customer"}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.name} className="sm:col-span-2"><Input autoFocus value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} /></Field>
              <Field label="Phone" error={errors.phone}><Input value={dialog.data.phone} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} /></Field>
              <Field label="Email (optional)" error={errors.email}><Input value={dialog.data.email} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, email: e.target.value } })} /></Field>
              <Field label="City" error={errors.city} className="sm:col-span-2">
                <SearchableSelect
                  value={dialog.data.city}
                  onChange={(city) => setDialog({ ...dialog, data: { ...dialog.data, city } })}
                  placeholder="Select city"
                  options={cityOptions}
                />
              </Field>
              <Field label="Address" className="sm:col-span-2"><Textarea value={dialog.data.address} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, address: e.target.value } })} /></Field>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete customer?" description={`This will permanently remove ${del?.name}. Their sales history will remain.`}
        onConfirm={() => { if (del) { actions.deleteCustomer(del.id); toast.success("Customer deleted."); } setDel(null); }} />

      {pay && <PaymentDialog open={!!pay} onOpenChange={(o) => !o && setPay(null)} title={`Add payment · ${pay.name}`} due={customerStats(db, pay.id).due} onSubmit={(a, m) => actions.recordCustomerPayment(pay.id, a, m)} />}
    </div>
  );
}
