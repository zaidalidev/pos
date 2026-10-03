import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, CalendarDays, FileText, Hash, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, CurrencyInput, DataTable, DateRangePicker, EmptyState, Field, FilterBar, PageHeader, SearchInput, SearchableSelect, SimpleSelect, StatCard, useFakeLoading, type Column } from "@/components/shared";
import { actions, useDB } from "@/lib/store";
import { fmtDate, inRange, isToday, pageHead, rs, toDateInput, type Range } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { EXPENSE_CATEGORIES, accountIdOf, type Expense } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/expenses")({
  head: pageHead("Expenses", "Record shop expenses such as rent, salary, bills and transport."),
  component: ExpensesPage,
});

type Form = { date: string; category: string; description: string; amount: number; accountId: string };
const empty = (cashId: string): Form => ({ date: toDateInput(new Date()), category: "Rent", description: "", amount: 0, accountId: cashId });

function inputToIso(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date();
  dt.setFullYear(y ?? 1970, (m || 1) - 1, d || 1);
  return dt.toISOString();
}

function ExpensesPage() {
  const db = useDB();
  const loading = useFakeLoading();
  const accountOptions = useMemo(
    () => db.accounts.filter((a) => a.active && a.type !== "Credit").map((a) => ({ value: a.id, label: a.name })),
    [db.accounts],
  );
  const defaultAccountId = accountOptions[0]?.value ?? accountIdOf("Cash");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [range, setRange] = useState<Range>({ from: "", to: "" });
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<Expense | null>(null);

  const categoryOptions = useMemo(() => {
    const preset = new Set<string>(EXPENSE_CATEGORIES);
    const fromExpenses = db.expenses.map((e) => e.category).filter((c) => c && !preset.has(c));
    const extras = [...new Set([...fromExpenses, ...customCategories])].sort((a, b) => a.localeCompare(b));
    return [...EXPENSE_CATEGORIES, ...extras];
  }, [db.expenses, customCategories]);

  const totals = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const month = db.expenses.filter((e) => new Date(e.date) >= monthStart).reduce((a, e) => a + e.amount, 0);
    const today = db.expenses.filter((e) => isToday(e.date)).reduce((a, e) => a + e.amount, 0);
    const all = db.expenses.reduce((a, e) => a + e.amount, 0);
    return { all, today, month, count: db.expenses.length };
  }, [db.expenses]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return db.expenses.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (!inRange(e.date, range)) return false;
      if (!query) return true;
      return `${e.category} ${e.description} ${e.method} ${e.addedBy}`.toLowerCase().includes(query);
    });
  }, [db.expenses, q, category, range]);

  const filteredTotal = rows.reduce((a, e) => a + e.amount, 0);

  const openEdit = (e: Expense) => {
    setDialog({
      mode: "edit",
      id: e.id,
      data: { date: toDateInput(new Date(e.date)), category: e.category, description: e.description, amount: e.amount, accountId: e.accountId },
    });
    setErrors({});
  };

  const openAdd = () => { setDialog({ mode: "add", data: empty(defaultAccountId) }); setErrors({}); };

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.date) e.date = "Date is required.";
    if (!f.category) e.category = "Category is required.";
    if (!f.description.trim()) e.description = "Description is required.";
    if (!f.amount || f.amount <= 0) e.amount = "Enter an amount greater than zero.";
    if (!f.accountId) e.accountId = "Account is required.";
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data);
    setErrors(e);
    if (Object.keys(e).length) return;
    const existing = dialog.id ? db.expenses.find((x) => x.id === dialog.id) : undefined;
    const acc = db.accounts.find((a) => a.id === dialog.data.accountId);
    actions.saveExpense({
      date: inputToIso(dialog.data.date),
      category: dialog.data.category,
      description: dialog.data.description.trim(),
      amount: dialog.data.amount,
      accountId: dialog.data.accountId,
      method: acc?.name ?? "Cash",
      addedBy: existing?.addedBy ?? db.currentUser,
      ...(dialog.id ? { id: dialog.id } : {}),
    });
    toast.success(dialog.mode === "add" ? "Expense added." : "Expense updated.");
    setDialog(null);
    setQ("");
  };

  const cols: Column<Expense>[] = [
    { key: "date", header: "Date", cell: (e) => fmtDate(e.date) },
    { key: "category", header: "Category", cell: (e) => <span className="font-medium">{e.category}</span> },
    { key: "desc", header: "Description", cell: (e) => e.description },
    { key: "amount", header: "Amount", cell: (e) => <b>{rs(e.amount)}</b>, className: "text-right" },
    { key: "method", header: "Payment Method", cell: (e) => e.method },
    { key: "by", header: "Added By", cell: (e) => e.addedBy },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (e) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(ev) => ev.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem onClick={() => openEdit(e)}><Pencil className="size-4" />Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDel(e)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "expenses.pdf",
      title: "Expenses",
      shopName: db.settings.shop.name,
      orientation: "landscape",
      columns: [
        { key: "date", header: "Date", width: 28 },
        { key: "category", header: "Category", width: 32 },
        { key: "desc", header: "Description", width: 70 },
        { key: "amount", header: "Amount", align: "right", width: 28 },
        { key: "method", header: "Method", width: 24 },
        { key: "by", header: "Added By", width: 28 },
      ],
      rows: rows.map((e) => ({
        date: fmtDate(e.date),
        category: e.category,
        desc: e.description,
        amount: rs(e.amount),
        method: e.method,
        by: e.addedBy,
      })),
      summary: [{ label: "Total", value: rs(filteredTotal) }],
    });
  };

  const filtered = !!(q || category !== "all" || range.from || range.to);

  return (
    <div>
      <PageHeader
        title="Expenses"
        titleAside={
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Total expenses" value={rs(totals.all)} icon={Wallet} tone="destructive" compact />
            <StatCard label="Today" value={rs(totals.today)} icon={Calendar} tone="warning" compact />
            <StatCard label="This month" value={rs(totals.month)} icon={CalendarDays} tone="info" compact />
            <StatCard label="Records" value={totals.count} icon={Hash} compact />
          </div>
        }
      />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search description, category or person" className="sm:w-72" />
          <SimpleSelect
            value={category}
            onChange={setCategory}
            className="sm:w-44"
            placeholder="All categories"
            options={[{ value: "all", label: "All categories" }, ...categoryOptions.map((c) => ({ value: c, label: c }))]}
          />
          <DateRangePicker value={range} onChange={setRange} />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button onClick={openAdd}><Plus className="size-4" />Add Expense</Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(e) => e.id}
          onRowClick={openEdit}
          empty={
            <EmptyState
              icon={Wallet}
              title={filtered ? "No expenses match your filters." : "No expenses yet."}
              description={filtered ? "Try a different category, date or search." : "Record rent, bills, salary and other shop costs."}
              action={!filtered ? <Button onClick={openAdd}><Plus className="size-4" />Add Expense</Button> : undefined}
            />
          }
        />
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "add" ? "Add Expense" : "Edit Expense"}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" error={errors.date}>
                <Input type="date" value={dialog.data.date} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, date: e.target.value } })} className="bg-card" />
              </Field>
              <Field label="Category" error={errors.category}>
                <SearchableSelect
                  value={dialog.data.category}
                  onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, category: v } })}
                  options={[...categoryOptions]}
                  placeholder="Select or add a category"
                  emptyText="No matching category."
                  onCreate={(label) => {
                    setCustomCategories((prev) => (prev.some((c) => c.toLowerCase() === label.toLowerCase()) ? prev : [...prev, label]));
                    setDialog({ ...dialog, data: { ...dialog.data, category: label } });
                  }}
                />
              </Field>
              <Field label="Description" error={errors.description} className="sm:col-span-2">
                <Input autoFocus value={dialog.data.description} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, description: e.target.value } })} placeholder="e.g. Shop rent for the month" className="bg-card" />
              </Field>
              <Field label="Amount" error={errors.amount}>
                <CurrencyInput autoFocus={false} value={dialog.data.amount} onChange={(n) => setDialog({ ...dialog, data: { ...dialog.data, amount: n } })} />
              </Field>
              <Field label="Account" error={errors.accountId}>
                <SimpleSelect value={dialog.data.accountId} onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, accountId: v } })} options={accountOptions} />
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
        title="Delete expense?"
        description={del ? `${del.category} · ${del.description} (${rs(del.amount)}) will be removed.` : ""}
        onConfirm={() => { if (del) { actions.deleteExpense(del.id); toast.success("Expense deleted."); } setDel(null); }}
      />
    </div>
  );
}
