import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Eye, Landmark, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, CurrencyInput, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, SimpleSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { accountStats, actions, useDB } from "@/lib/store";
import { pageHead, rs } from "@/lib/format";
import { ACCOUNT_TYPES, type Account, type AccountType } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/accounts/")({
  head: pageHead("Accounts", "Cash, bank and wallet accounts with balances."),
  component: AccountsPage,
});

type Form = {
  name: string;
  type: AccountType;
  accountNumber: string;
  phone: string;
  openingBalance: number;
  notes: string;
  active: boolean;
};
const empty = (): Form => ({
  name: "",
  type: "Bank",
  accountNumber: "",
  phone: "",
  openingBalance: 0,
  notes: "",
  active: true,
});

type BalanceDialog =
  | { mode: "add"; account: Account; amount: number }
  | { mode: "edit"; account: Account; amount: number };

function AccountsPage() {
  const db = useDB();
  const navigate = useNavigate();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<Account | null>(null);
  const [balanceDialog, setBalanceDialog] = useState<BalanceDialog | null>(null);
  const [balanceError, setBalanceError] = useState("");

  const rows = useMemo(() => db.accounts.filter((a) =>
    !q || `${a.name} ${a.type} ${a.accountNumber} ${a.phone}`.toLowerCase().includes(q.toLowerCase())
  ), [db.accounts, q]);

  const totals = useMemo(() => {
    let balance = 0;
    let receivables = 0;
    for (const a of db.accounts) {
      const s = accountStats(db, a.id);
      if (a.type === "Credit") receivables += s.receivables;
      else balance += s.balance;
    }
    return { balance, receivables, active: db.accounts.filter((a) => a.active).length };
  }, [db]);

  const validate = (f: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!f.type) e.type = "Type is required.";
    if (f.openingBalance < 0) e.openingBalance = "Opening balance cannot be negative.";
    return e;
  };

  const save = () => {
    if (!dialog) return;
    const e = validate(dialog.data);
    setErrors(e);
    if (Object.keys(e).length) return;
    actions.saveAccount({ ...dialog.data, ...(dialog.id ? { id: dialog.id } : {}) });
    toast.success(dialog.mode === "add" ? "Account added." : "Account updated.");
    setDialog(null);
    setQ("");
  };

  const saveBalance = () => {
    if (!balanceDialog) return;
    if (balanceDialog.mode === "add") {
      if (balanceDialog.amount <= 0) {
        setBalanceError("Enter an amount greater than zero.");
        return;
      }
      const result = actions.addAccountBalance(balanceDialog.account.id, balanceDialog.amount);
      if (result === "ok") toast.success(`Added ${rs(balanceDialog.amount)} to ${balanceDialog.account.name}.`);
      else toast.error("Could not add balance.");
    } else {
      if (balanceDialog.amount < 0) {
        setBalanceError("Opening balance cannot be negative.");
        return;
      }
      const result = actions.setOpeningBalance(balanceDialog.account.id, balanceDialog.amount);
      if (result === "ok") toast.success("Opening balance updated.");
      else toast.error("Could not update opening balance.");
    }
    setBalanceDialog(null);
    setBalanceError("");
  };

  const cols: Column<Account>[] = [
    { key: "name", header: "Name", cell: (a) => <span className="font-semibold text-primary">{a.name}</span> },
    { key: "type", header: "Type", cell: (a) => a.type },
    {
      key: "details",
      header: "Account # / Phone",
      cell: (a) => a.accountNumber || a.phone || "—",
    },
    {
      key: "opening",
      header: "Opening",
      className: "text-right",
      cell: (a) => (
        <div className="flex flex-col items-end gap-0.5">
          <span>{rs(a.openingBalance)}</span>
          {a.openingBalanceEdited ? <StatusBadge status="Edited" className="text-[10px]" /> : null}
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      className: "text-right",
      cell: (a) => {
        const s = accountStats(db, a.id);
        return a.type === "Credit" ? rs(s.receivables) : rs(s.balance);
      },
    },
    {
      key: "balanceActions",
      header: "Balance actions",
      className: "w-[1%] whitespace-nowrap",
      cell: (a) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={() => {
              setBalanceDialog({ mode: "add", account: a, amount: 0 });
              setBalanceError("");
            }}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2"
            onClick={() => {
              setBalanceDialog({ mode: "edit", account: a, amount: a.openingBalance });
              setBalanceError("");
            }}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      ),
    },
    {
      key: "active",
      header: "Status",
      cell: (a) => <StatusBadge status={a.active ? "Active" : "Inactive"} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate({ to: "/accounts/$id", params: { id: a.id } })}><Eye className="size-4" />View</DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setDialog({
                mode: "edit",
                id: a.id,
                data: {
                  name: a.name,
                  type: a.type,
                  accountNumber: a.accountNumber,
                  phone: a.phone,
                  openingBalance: a.openingBalance,
                  notes: a.notes,
                  active: a.active,
                },
              });
              setErrors({});
            }}><Pencil className="size-4" />Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDel(a)}><Trash2 className="size-4" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Accounts" description={`${rows.length} accounts`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total accounts" value={db.accounts.length} icon={Landmark} />
        <StatCard label="Active" value={totals.active} icon={Wallet} tone="info" />
        <StatCard label="Total balance" value={rs(totals.balance)} icon={Wallet} tone="success" />
        <StatCard label="Receivables" value={rs(totals.receivables)} icon={AlertCircle} tone="warning" />
      </div>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, type, number or phone" className="sm:w-80" />
          <div className="flex gap-2 sm:ml-auto">
            <Button onClick={() => { setDialog({ mode: "add", data: empty() }); setErrors({}); }}><Plus className="size-4" />Add Account</Button>
          </div>
        </FilterBar>
        <DataTable
          loading={loading}
          columns={cols}
          rows={rows}
          rowKey={(a) => a.id}
          onRowClick={(a) => navigate({ to: "/accounts/$id", params: { id: a.id } })}
          empty={
            <EmptyState
              icon={Landmark}
              title={q ? "No accounts match your search." : "No accounts yet."}
              description={q ? "Try a different name, type, number or phone." : "Add cash, bank or wallet accounts to track balances."}
              action={!q ? <Button onClick={() => { setDialog({ mode: "add", data: empty() }); setErrors({}); }}><Plus className="size-4" />Add Account</Button> : undefined}
            />
          }
        />
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "add" ? "Add Account" : "Edit Account"}</DialogTitle></DialogHeader>
          {dialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.name} className="sm:col-span-2">
                <Input autoFocus value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} placeholder="e.g. HBL Current" />
              </Field>
              <Field label="Type" error={errors.type}>
                <SimpleSelect value={dialog.data.type} onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, type: v as AccountType } })} options={[...ACCOUNT_TYPES]} />
              </Field>
              <Field label="Status">
                <SimpleSelect
                  value={dialog.data.active ? "Active" : "Inactive"}
                  onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, active: v === "Active" } })}
                  options={["Active", "Inactive"]}
                />
              </Field>
              <Field label="Account # / IBAN">
                <Input value={dialog.data.accountNumber} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, accountNumber: e.target.value } })} placeholder="Optional" />
              </Field>
              <Field label="Phone (wallet)">
                <Input value={dialog.data.phone} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} placeholder="Optional" />
              </Field>
              <Field
                label="Opening balance"
                error={errors.openingBalance}
                hint={dialog.mode === "edit" ? "Changing this marks opening as Edited." : undefined}
                className="sm:col-span-2"
              >
                <CurrencyInput value={dialog.data.openingBalance} onChange={(n) => setDialog({ ...dialog, data: { ...dialog.data, openingBalance: n } })} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={dialog.data.notes} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, notes: e.target.value } })} />
              </Field>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!balanceDialog} onOpenChange={(o) => { if (!o) { setBalanceDialog(null); setBalanceError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {balanceDialog?.mode === "add" ? "Add Balance" : "Edit Opening Balance"}
              {balanceDialog ? ` — ${balanceDialog.account.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {balanceDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {balanceDialog.mode === "add"
                  ? `Current opening: ${rs(balanceDialog.account.openingBalance)}. Enter amount to add.`
                  : `Current opening: ${rs(balanceDialog.account.openingBalance)}. Set the new opening amount.`}
              </p>
              <Field
                label={balanceDialog.mode === "add" ? "Amount to add" : "Opening balance"}
                error={balanceError || undefined}
              >
                <CurrencyInput
                  autoFocus
                  value={balanceDialog.amount}
                  onChange={(n) => setBalanceDialog({ ...balanceDialog, amount: n })}
                />
              </Field>
              {balanceDialog.mode === "edit" && (
                <p className="text-xs text-muted-foreground">Saving a different amount will mark this opening as Edited.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBalanceDialog(null); setBalanceError(""); }}>Cancel</Button>
            <Button onClick={saveBalance}>{balanceDialog?.mode === "add" ? "Add Balance" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete account?"
        description={del ? `If ${del.name} has transactions it will be deactivated instead of deleted.` : ""}
        onConfirm={() => {
          if (!del) return;
          const result = actions.deleteAccount(del.id);
          if (result === "ok") toast.success("Account deleted.");
          else if (result === "has_activity") toast.success("Account has transactions — deactivated instead.");
          setDel(null);
        }}
      />
    </div>
  );
}
