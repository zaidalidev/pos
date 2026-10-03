import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Banknote, Eye, FileText, HandCoins, MoreHorizontal, Pencil, Plus, Trash2, UserRound, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, CurrencyInput, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, SearchableSelect, SimpleSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { actions, currentMonthKey, staffStats, useDB } from "@/lib/store";
import { pageHead, rs } from "@/lib/format";
import { exportTablePdf } from "@/lib/pdf";
import { SALARY_TYPES, STAFF_ROLES, accountIdOf, salaryFieldLabel, type SalaryType, type Staff, type StaffRole, type StaffTxnKind } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/staff/")({
  head: pageHead("Staff", "Staff salaries, advances, payments and remaining balances."),
  component: StaffPage,
});

type Form = { name: string; phone: string; role: StaffRole; salary: number; salaryType: SalaryType; salaryCustom: string; status: "Active" | "Inactive"; address: string; notes: string };
const empty = (): Form => ({ name: "", phone: "", role: "Salesman", salary: 0, salaryType: "Monthly", salaryCustom: "", status: "Active", address: "", notes: "" });

function formatStaffSalary(s: Staff) {
  const type = s.salaryType ?? "Monthly";
  if (type === "Custom") return s.salaryCustom?.trim() || "—";
  const amount = rs(s.salary);
  if (type === "Daily") return `${amount}/day`;
  return `${amount}/mo`;
}

type TxnDialog = { staff: Staff | null; kind: StaffTxnKind; amount: number; advanceCut: number; accountId: string; note: string };

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString("en-PK", { month: "long", year: "numeric" });
}

function StaffPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const month = currentMonthKey();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<Staff | null>(null);
  const [txn, setTxn] = useState<TxnDialog | null>(null);
  const [txnErr, setTxnErr] = useState("");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return db.staff.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!query) return true;
      return `${s.name} ${s.phone} ${s.role}`.toLowerCase().includes(query);
    });
  }, [db.staff, q, statusFilter]);

  const totals = useMemo(() => {
    const active = db.staff.filter((s) => s.status === "Active");
    const stats = active.map((s) => staffStats(db, s.id, month));
    return {
      count: db.staff.length,
      active: active.length,
      salaries: stats.reduce((a, b) => a + b.salary, 0),
      paid: stats.reduce((a, b) => a + b.paid, 0),
      advance: stats.reduce((a, b) => a + b.unpaidAdvance, 0),
      remaining: stats.reduce((a, b) => a + b.remaining, 0),
    };
  }, [db, month]);

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!f.phone.trim()) e.phone = "Phone is required.";
    else if (!/^[0-9+\-\s]{7,15}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
    if (f.salaryType === "Custom") {
      if (!f.salaryCustom.trim()) e.salaryCustom = "Write the salary details.";
    } else if (!f.salary || f.salary <= 0) {
      e.salary = `Enter a valid ${salaryFieldLabel(f.salaryType).toLowerCase()}.`;
    }
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data);
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.saveStaff({
      name: dialog.data.name.trim(),
      phone: dialog.data.phone.trim(),
      role: dialog.data.role,
      salary: dialog.data.salaryType === "Custom" ? 0 : dialog.data.salary,
      salaryType: dialog.data.salaryType,
      salaryCustom: dialog.data.salaryType === "Custom" ? dialog.data.salaryCustom.trim() : "",
      status: dialog.data.status,
      address: dialog.data.address.trim(),
      notes: dialog.data.notes.trim(),
      ...(dialog.id ? { id: dialog.id } : {}),
    });
    toast.success(dialog.mode === "add" ? "Staff member added." : "Staff updated.");
    setDialog(null);
    setQ("");
    setStatusFilter("all");
  };

  const saveTxn = () => {
    if (!txn?.staff) return;
    if (txn.kind === "Advance") {
      if (txn.amount <= 0) return setTxnErr("Enter an amount greater than zero.");
      actions.recordStaffTxn({
        staffId: txn.staff.id,
        kind: "Advance",
        amount: txn.amount,
        accountId: txn.accountId,
        note: txn.note,
        forMonth: month,
      });
      toast.success(`Advance of ${rs(txn.amount)} recorded for ${txn.staff.name}.`);
      setTxn(null);
      return;
    }

    const isCustom = (txn.staff.salaryType ?? "Monthly") === "Custom";
    const st = staffStats(db, txn.staff.id, month);
    if (txn.amount <= 0 && txn.advanceCut <= 0) return setTxnErr("Enter payment or advance cut amount.");
    if (txn.advanceCut < 0) return setTxnErr("Advance cut cannot be negative.");
    if (txn.advanceCut > st.unpaidAdvance) return setTxnErr(`Advance cut cannot be more than unpaid (${rs(st.unpaidAdvance)}).`);
    if (!isCustom) {
      const settled = txn.amount + txn.advanceCut;
      if (settled > st.remaining) return setTxnErr(`Total cannot be more than remaining (${rs(st.remaining)}).`);
    }
    if (txn.amount > 0) {
      actions.recordStaffTxn({
        staffId: txn.staff.id,
        kind: "Payment",
        amount: txn.amount,
        accountId: txn.accountId,
        note: txn.note,
        forMonth: month,
      });
    }
    if (txn.advanceCut > 0) {
      actions.recordStaffTxn({
        staffId: txn.staff.id,
        kind: "AdvanceCut",
        amount: txn.advanceCut,
        accountId: txn.accountId,
        note: txn.note || "Advance cut from salary",
        forMonth: month,
      });
    }
    toast.success(`Payment recorded for ${txn.staff.name}.`);
    setTxn(null);
  };

  const openPayment = (staff: Staff | null = null) => {
    const amount = staff && (staff.salaryType ?? "Monthly") !== "Custom" ? staffStats(db, staff.id, month).remaining : 0;
    setTxn({ staff, kind: "Payment", amount, advanceCut: 0, accountId: accountIdOf("Cash"), note: "" });
    setTxnErr("");
  };

  const cols: Column<Staff>[] = [
    { key: "name", header: "Name", cell: (s) => <span className="font-semibold text-primary">{s.name}</span> },
    { key: "phone", header: "Phone", cell: (s) => s.phone },
    { key: "role", header: "Role", cell: (s) => <StatusBadge status={s.role} /> },
    { key: "salary", header: "Salary", cell: (s) => formatStaffSalary(s), className: "text-right" },
    { key: "paid", header: "Paid", cell: (s) => rs(staffStats(db, s.id, month).paid), className: "text-right" },
    {
      key: "advance",
      header: "Advance due",
      cell: (s) => {
        const due = staffStats(db, s.id, month).unpaidAdvance;
        return due ? <span className="font-medium text-warning">{rs(due)}</span> : rs(0);
      },
      className: "text-right",
    },
    {
      key: "remaining",
      header: "Remaining",
      cell: (s) => {
        if ((s.salaryType ?? "Monthly") === "Custom") return "—";
        const rem = staffStats(db, s.id, month).remaining;
        return <span className={rem ? "font-medium text-destructive" : ""}>{rs(rem)}</span>;
      },
      className: "text-right",
    },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    {
      key: "actions",
      header: "",
      className: "w-40 text-right",
      cell: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" onClick={() => openPayment(s)}>
            <Banknote className="size-3.5" />Payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate({ to: "/staff/$id", params: { id: s.id } })}><Eye className="size-4" />View</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDialog({ mode: "edit", id: s.id, data: { name: s.name, phone: s.phone, role: s.role, salary: s.salary, salaryType: s.salaryType ?? "Monthly", salaryCustom: s.salaryCustom ?? "", status: s.status, address: s.address, notes: s.notes } }); setErrors({}); }}><Pencil className="size-4" />Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openPayment(s)}><Banknote className="size-4" />Add payment</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setTxn({ staff: s, kind: "Advance", amount: 0, advanceCut: 0, accountId: accountIdOf("Cash"), note: "" }); setTxnErr(""); }}><HandCoins className="size-4" />Give advance</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDel(s)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const doPdf = () => {
    exportTablePdf({
      filename: "staff.pdf",
      title: `Staff · ${monthLabel(month)}`,
      shopName: db.settings.shop.name,
      columns: [
        { key: "name", header: "Name", width: 36 },
        { key: "role", header: "Role", width: 24 },
        { key: "salary", header: "Salary", align: "right", width: 26 },
        { key: "paid", header: "Paid", align: "right", width: 26 },
        { key: "advance", header: "Advance due", align: "right", width: 26 },
        { key: "remaining", header: "Remaining", align: "right", width: 28 },
      ],
      rows: rows.map((s) => {
        const st = staffStats(db, s.id, month);
        return { name: s.name, role: s.role, salary: formatStaffSalary(s), paid: rs(st.paid), advance: rs(st.unpaidAdvance), remaining: (s.salaryType ?? "Monthly") === "Custom" ? "—" : rs(st.remaining) };
      }),
      summary: [
        { label: "Staff", value: String(rows.length) },
        { label: "Total remaining", value: rs(totals.remaining) },
      ],
    });
  };

  return (
    <div>
      <div className="mb-4 mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total staff" value={totals.count} icon={UsersRound} />
        <StatCard label="Active" value={totals.active} icon={UserRound} tone="info" />
        <StatCard label="Due this month" value={rs(totals.salaries)} icon={Wallet} />
        <StatCard label="Paid this month" value={rs(totals.paid)} icon={Banknote} tone="success" />
        <StatCard label="Advance due" value={rs(totals.advance)} icon={HandCoins} tone="warning" />
        <StatCard label="Remaining" value={rs(totals.remaining)} icon={AlertCircle} tone={totals.remaining ? "warning" : "default"} />
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, phone or role" className="sm:w-72" />
          <SimpleSelect
            value={statusFilter}
            onChange={setStatusFilter}
            className="sm:w-40"
            options={[
              { value: "all", label: "All status" },
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={doPdf}><FileText className="size-4" />PDF</Button>
            <Button onClick={() => { setDialog({ mode: "add", data: empty() }); setErrors({}); }}><Plus className="size-4" />Add Staff</Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={(s) => navigate({ to: "/staff/$id", params: { id: s.id } })}
          empty={
            <EmptyState
              icon={UsersRound}
              title={q || statusFilter !== "all" ? "No staff match your filters." : "No staff yet."}
              description={q || statusFilter !== "all" ? "Try a different search or filter." : "Add staff to track salaries, advances and remaining payments."}
              action={!(q || statusFilter !== "all") ? <Button onClick={() => { setDialog({ mode: "add", data: empty() }); setErrors({}); }}><Plus className="size-4" />Add Staff</Button> : undefined}
            />
          }
        />
      </Card>

      <Dialog
        open={!!dialog}
        onOpenChange={(o) => {
          if (!o) {
            const phone = dialog?.data.phone.trim();
            setDialog(null);
            // Browser autofill often dumps the form phone into the page search when the dialog closes.
            if (phone) {
              requestAnimationFrame(() => setQ((cur) => (cur.trim() === phone ? "" : cur)));
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "add" ? "Add Staff" : "Edit Staff"}</DialogTitle></DialogHeader>
          {dialog && (
            <form
              className="grid gap-3 sm:grid-cols-2"
              autoComplete="off"
              onSubmit={(e) => { e.preventDefault(); save(); }}
            >
              <Field label="Name" error={errors.name} className="sm:col-span-2">
                <Input autoFocus autoComplete="off" name="staff-name" value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <Input autoComplete="off" name="staff-phone" inputMode="tel" value={dialog.data.phone} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} />
              </Field>
              <Field label="Role">
                <SimpleSelect value={dialog.data.role} onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, role: v as StaffRole } })} options={[...STAFF_ROLES]} />
              </Field>
              <Field label="Salary type">
                <SimpleSelect
                  value={dialog.data.salaryType}
                  onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, salaryType: v as SalaryType } })}
                  options={[...SALARY_TYPES]}
                />
              </Field>
              {dialog.data.salaryType === "Custom" ? (
                <Field label="Salary details" error={errors.salaryCustom} className="sm:col-span-2">
                  <Input
                    autoComplete="off"
                    name="staff-salary-custom"
                    placeholder="e.g. Commission 5%, week me 3000, piece rate…"
                    value={dialog.data.salaryCustom}
                    onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, salaryCustom: e.target.value } })}
                  />
                </Field>
              ) : (
                <Field label={salaryFieldLabel(dialog.data.salaryType)} error={errors.salary}>
                  <CurrencyInput value={dialog.data.salary} onChange={(n) => setDialog({ ...dialog, data: { ...dialog.data, salary: n } })} />
                </Field>
              )}
              <Field label="Status">
                <SimpleSelect
                  value={dialog.data.status}
                  onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, status: v as "Active" | "Inactive" } })}
                  options={["Active", "Inactive"]}
                />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input autoComplete="off" name="staff-address" value={dialog.data.address} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, address: e.target.value } })} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={dialog.data.notes} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, notes: e.target.value } })} />
              </Field>
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!txn} onOpenChange={(o) => !o && setTxn(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {txn?.kind === "Advance" ? "Give advance" : "Add payment"}
              {txn?.staff ? ` · ${txn.staff.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {txn && (
            <div className="space-y-3">
              <Field label="Staff">
                <SearchableSelect
                  value={txn.staff?.id ?? ""}
                  onChange={(id) => {
                    const s = db.staff.find((x) => x.id === id) ?? null;
                    const amount = s && txn.kind === "Payment" && (s.salaryType ?? "Monthly") !== "Custom"
                      ? staffStats(db, s.id, month).remaining
                      : 0;
                    setTxn({ ...txn, staff: s, amount, advanceCut: 0 });
                    setTxnErr("");
                  }}
                  placeholder="Select staff"
                  options={db.staff.map((s) => ({ value: s.id, label: `${s.name} · ${s.role}` }))}
                />
              </Field>
              {txn.staff && txn.kind === "Payment" && (txn.staff.salaryType ?? "Monthly") !== "Custom" && (
                <p className="text-sm text-muted-foreground">
                  Remaining salary: <b>{rs(staffStats(db, txn.staff.id, month).remaining)}</b>
                </p>
              )}
              {txn.staff && txn.kind === "Payment" && staffStats(db, txn.staff.id, month).unpaidAdvance > 0 && (
                <p className="text-sm text-muted-foreground">
                  Unpaid advance: <b>{rs(staffStats(db, txn.staff.id, month).unpaidAdvance)}</b>
                </p>
              )}
              {txn.staff && (txn.staff.salaryType ?? "Monthly") === "Custom" && txn.staff.salaryCustom?.trim() && (
                <p className="text-sm text-muted-foreground">
                  Salary: <b>{txn.staff.salaryCustom.trim()}</b>
                </p>
              )}
              <Field label={txn.kind === "Advance" ? "Advance amount" : "Cash payment"} error={txnErr}>
                <CurrencyInput autoFocus={!!txn.staff} value={txn.amount} onChange={(n) => { setTxn({ ...txn, amount: n }); setTxnErr(""); }} />
              </Field>
              {txn.kind === "Payment" && txn.staff && staffStats(db, txn.staff.id, month).unpaidAdvance > 0 && (
                <Field label="Cut advance (optional)">
                  <CurrencyInput
                    value={txn.advanceCut}
                    onChange={(n) => { setTxn({ ...txn, advanceCut: n }); setTxnErr(""); }}
                  />
                </Field>
              )}
              <Field label="Account">
                <SimpleSelect
                  value={txn.accountId}
                  onChange={(v) => setTxn({ ...txn, accountId: v })}
                  options={db.accounts.filter((a) => a.active && a.type !== "Credit").map((a) => ({ value: a.id, label: a.name }))}
                />
              </Field>
              <Field label="Note (optional)">
                <Input value={txn.note} onChange={(e) => setTxn({ ...txn, note: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxn(null)}>Cancel</Button>
            <Button onClick={saveTxn} disabled={!txn?.staff}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete staff?"
        description={`This will permanently remove ${del?.name} and their payment history.`}
        onConfirm={() => {
          if (del) {
            actions.deleteStaff(del.id);
            toast.success("Staff deleted.");
          }
          setDel(null);
        }}
      />
    </div>
  );
}
