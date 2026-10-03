import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  CurrencyInput,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  PageHeader,
  SearchInput,
  SimpleSelect,
  StatusBadge,
  type Column,
} from "@/components/shared";
import { actions, usePlatform } from "@/lib/store";
import { fmtDateTime, pageHead, rs } from "@/lib/format";
import { monthKey, shopMonthlyFee } from "@/lib/plans";
import type { PlatformFeeStatus, Shop } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/shops/")({
  head: pageHead("Shops", "All shops — open one to see its logins."),
  component: AdminShops,
});

type Form = {
  shopName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  monthlyFee: number;
  feeStatus: PlatformFeeStatus;
};

type FormErrors = Partial<Record<keyof Form, string>>;

const emptyForm = (): Form => ({
  shopName: "",
  ownerName: "",
  email: "",
  phone: "",
  password: "",
  city: "",
  monthlyFee: 1500,
  feeStatus: "Pending",
});

function AdminShops() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});

  const ownerOf = (shopId: string) => {
    const users = platform.users.filter((u) => u.shopId === shopId);
    return users.find((u) => u.role === "Owner") ?? users[0] ?? null;
  };

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return platform.shops.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (!query) return true;
      const owner = ownerOf(s.id);
      return `${s.name} ${s.email} ${s.phone} ${s.city} ${owner?.name ?? ""} ${owner?.email ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [platform.shops, platform.users, q, status]);

  const openShop = (shop: Shop) => {
    navigate({ to: "/admin/shops/$id", params: { id: shop.id } });
  };

  const enter = (shop: Shop) => {
    const res = actions.enterShop(shop.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Entered ${shop.name}`);
    navigate({ to: "/dashboard" });
  };

  const toggleStatus = (shop: Shop) => {
    const next = shop.status === "Active" ? "Suspended" : "Active";
    actions.setShopStatus(shop.id, next);
    toast.success(`${shop.name} is now ${next}.`);
  };

  const openCreate = () => {
    setForm(emptyForm());
    setErrors({});
    setOpen(true);
  };

  const validate = (f: Form): FormErrors => {
    const e: FormErrors = {};
    if (!f.shopName.trim()) e.shopName = "Shop name is required.";
    if (!f.ownerName.trim()) e.ownerName = "Owner name is required.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email.";
    if (!f.phone.trim()) e.phone = "Phone is required.";
    if (f.password.length < 6) e.password = "Password must be at least 6 characters.";
    if (f.monthlyFee < 0) e.monthlyFee = "Fee cannot be negative.";
    return e;
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length) return;

    const res = await actions.createShop({
      shopName: form.shopName,
      ownerName: form.ownerName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      city: form.city,
      monthlyFee: form.monthlyFee,
      initialFeeStatus: form.feeStatus,
      initialFeeMonth: monthKey(),
    });
    if (!res.ok) {
      setErrors({ email: res.error });
      toast.error(res.error);
      return;
    }
    toast.success(`${form.shopName.trim()} created with monthly fee ${rs(form.monthlyFee)}.`);
    setOpen(false);
    navigate({ to: "/admin/shops/$id", params: { id: res.shopId } });
  };

  const cols: Column<Shop>[] = [
    {
      key: "name",
      header: "Shop",
      cell: (shop) => {
        const owner = ownerOf(shop.id);
        return (
          <button type="button" className="text-left hover:underline" onClick={() => openShop(shop)}>
            <p className="font-medium">{shop.name}</p>
            <p className="text-xs text-muted-foreground">
              {owner ? `Owner: ${owner.name}` : shop.email}
            </p>
          </button>
        );
      },
    },
    {
      key: "login",
      header: "Main login",
      cell: (shop) => {
        const owner = ownerOf(shop.id);
        return owner ? (
          <div>
            <p className="text-sm">{owner.email}</p>
            <p className="text-xs text-muted-foreground">{owner.phone || "—"}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "fee",
      header: "Monthly fee",
      cell: (s) => <span className="font-medium tabular-nums">{rs(shopMonthlyFee(s))}</span>,
    },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    {
      key: "users",
      header: "Logins",
      cell: (s) => platform.shopStats(s.id).users,
    },
    { key: "created", header: "Created", cell: (s) => <span className="text-muted-foreground">{fmtDateTime(s.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (shop) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openShop(shop)}>View details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => enter(shop)}>Enter shop</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleStatus(shop)}>
              {shop.status === "Active" ? "Suspend shop" : "Activate shop"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shops"
        description="Each row is one shop. Open it to see owner, logins, and fee history."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Add shop
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="Search shop or owner name…" className="sm:w-72" />
          <SimpleSelect
            value={status}
            onChange={setStatus}
            className="sm:w-40"
            options={[
              { value: "all", label: "All statuses" },
              { value: "Active", label: "Active" },
              { value: "Suspended", label: "Suspended" },
            ]}
          />
        </FilterBar>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={openShop}
          empty={
            <EmptyState
              icon={Store}
              title="No shops yet"
              description="Create a shop and give the owner login credentials."
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" />
                  Add shop
                </Button>
              }
            />
          }
        />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add shop</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create the shop and its owner login. Share these credentials with the shop owner.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Shop name" error={errors.shopName} className="sm:col-span-2">
                <Input
                  autoFocus
                  placeholder="Ali Mobile Accessories"
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                />
              </Field>
              <Field label="Owner name" error={errors.ownerName} className="sm:col-span-2">
                <Input
                  placeholder="Ali Khan"
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </Field>
              <Field label="Login email" error={errors.email}>
                <Input
                  type="email"
                  placeholder="ali@shop.pk"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <Input
                  placeholder="03001234567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="Password" error={errors.password}>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
              <Field label="Monthly fee (Rs.)" error={errors.monthlyFee}>
                <CurrencyInput
                  value={form.monthlyFee}
                  onChange={(n) => setForm({ ...form, monthlyFee: n })}
                />
              </Field>
              <Field label="This month" className="sm:col-span-2">
                <SimpleSelect
                  value={form.feeStatus}
                  onChange={(v) => setForm({ ...form, feeStatus: v as PlatformFeeStatus })}
                  options={[
                    { value: "Pending", label: "Pending — fee not received yet" },
                    { value: "Paid", label: "Paid — fee already received" },
                  ]}
                />
              </Field>
              <Field label="City" className="sm:col-span-2">
                <Input
                  placeholder="Karachi"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Create shop</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
