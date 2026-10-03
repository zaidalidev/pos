import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Shield, Trash2, UserCheck, UsersRound, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, DataTable, EmptyState, Field, FilterBar, PageHeader, SearchInput, SimpleSelect, StatCard, StatusBadge, useFakeLoading, type Column } from "@/components/shared";
import { actions, useDB } from "@/lib/store";
import { fmtDateTime, pageHead } from "@/lib/format";
import type { Role, User } from "@/lib/mock-data";
import {
  PERM_ACTIONS,
  PERM_MODULES,
  type PermAction,
  type PermModule,
  type RolePermissions,
} from "@/lib/permissions";

export const Route = createFileRoute("/_app/users")({
  head: pageHead("Users & Roles", "Manage staff accounts and role permissions."),
  component: UsersPage,
});

const ROLES: Role[] = ["Owner", "Manager", "Cashier", "Staff"];

type Form = {
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: "Active" | "Inactive";
  password: string;
};
const empty = (): Form => ({ name: "", email: "", phone: "", role: "Cashier", status: "Active", password: "" });

function UsersPage() {
  const db = useDB();
  const loading = useFakeLoading();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; data: Form; id?: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [del, setDel] = useState<User | null>(null);
  const [permRole, setPermRole] = useState<Role>("Manager");
  const [perms, setPerms] = useState<RolePermissions>(db.rolePermissions);

  useEffect(() => {
    setPerms(db.rolePermissions);
  }, [db.rolePermissions]);

  const totals = useMemo(() => {
    const active = db.users.filter((u) => u.status === "Active").length;
    const inactive = db.users.length - active;
    const owners = db.users.filter((u) => u.role === "Owner").length;
    return { total: db.users.length, active, inactive, owners };
  }, [db.users]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return db.users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!query) return true;
      return `${u.name} ${u.email} ${u.phone} ${u.role}`.toLowerCase().includes(query);
    });
  }, [db.users, q, roleFilter, statusFilter]);

  const openAdd = () => { setDialog({ mode: "add", data: empty() }); setErrors({}); };
  const openEdit = (u: User) => {
    setDialog({
      mode: "edit",
      id: u.id,
      data: { name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, password: "" },
    });
    setErrors({});
  };

  const validate = (f: Form, mode: "add" | "edit") => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!f.email.trim()) e.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email.";
    else if (db.users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase() && u.id !== dialog?.id)) e.email = "Email already in use.";
    if (!f.phone.trim()) e.phone = "Phone is required.";
    else if (!/^[0-9+\-\s]{7,15}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
    if (!f.role) e.role = "Role is required.";
    if (mode === "add") {
      if (f.password.length < 6) e.password = "Password must be at least 6 characters.";
    } else if (f.password && f.password.length < 6) {
      e.password = "Password must be at least 6 characters.";
    }
    return e;
  };

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!dialog) return;
    const e = validate(dialog.data, dialog.mode);
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = {
      name: dialog.data.name.trim(),
      email: dialog.data.email.trim(),
      phone: dialog.data.phone.trim(),
      role: dialog.data.role,
      status: dialog.data.status,
      ...(dialog.id ? { id: dialog.id } : {}),
      ...(dialog.mode === "add" || dialog.data.password
        ? { password: dialog.data.password }
        : {}),
    };
    setSaving(true);
    try {
      // New users are created in Neon Auth via admin.createUser (requires Make admin in Console).
      const result = await actions.saveUser(payload as Parameters<typeof actions.saveUser>[0]);
      if (!result.ok) {
        toast.error(result.error);
        setErrors({ email: result.error });
        return;
      }
      toast.success(
        dialog.mode === "add"
          ? `User added. They can sign in with ${dialog.data.email.trim()}.`
          : "User updated.",
      );
      setDialog(null);
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (module: PermModule, action: PermAction) => {
    if (permRole === "Owner") return;
    setPerms((prev) => ({
      ...prev,
      [permRole]: {
        ...prev[permRole],
        [module]: { ...prev[permRole][module], [action]: !prev[permRole][module][action] },
      },
    }));
  };

  const toggleRow = (module: PermModule, checked: boolean) => {
    if (permRole === "Owner") return;
    setPerms((prev) => ({
      ...prev,
      [permRole]: {
        ...prev[permRole],
        [module]: Object.fromEntries(PERM_ACTIONS.map((a) => [a, checked])) as Record<PermAction, boolean>,
      },
    }));
  };

  const cols: Column<User>[] = [
    { key: "name", header: "Name", cell: (u) => <span className="font-semibold text-primary">{u.name}</span> },
    { key: "email", header: "Email", cell: (u) => u.email },
    { key: "phone", header: "Phone", cell: (u) => u.phone },
    { key: "role", header: "Role", cell: (u) => <StatusBadge status={u.role} /> },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
    { key: "last", header: "Last Login", cell: (u) => (u.lastLogin ? fmtDateTime(u.lastLogin) : "Never") },
    {
      key: "actions",
      header: "",
      className: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => openEdit(u)}><Pencil className="size-4" />Edit</DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={u.role === "Owner" && db.users.filter((x) => x.role === "Owner").length <= 1}
              onClick={() => setDel(u)}
            >
              <Trash2 className="size-4" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description="Manage staff accounts and what each role can access. Users only see pages their role allows."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={totals.total} icon={UsersRound} />
        <StatCard label="Active" value={totals.active} icon={UserCheck} tone="success" />
        <StatCard label="Inactive" value={totals.inactive} icon={UserX} tone="warning" />
        <StatCard label="Owners" value={totals.owners} icon={Shield} tone="info" />
      </div>

      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="permissions">Role Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <FilterBar>
              <SearchInput value={q} onChange={setQ} placeholder="Search name, email or phone" className="sm:w-72" />
              <SimpleSelect
                value={roleFilter}
                onChange={setRoleFilter}
                className="sm:w-40"
                options={[{ value: "all", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: r }))]}
              />
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
              <Button onClick={openAdd} className="sm:ml-auto"><Plus className="size-4" />Add User</Button>
            </FilterBar>
            <DataTable
              loading={loading}
              columns={cols}
              rows={rows}
              rowKey={(u) => u.id}
              empty={
                <EmptyState
                  icon={UsersRound}
                  title="No users found."
                  description="Add a staff account to control access across the shop."
                  action={<Button onClick={openAdd}><Plus className="size-4" />Add User</Button>}
                />
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card className="shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-semibold">Permissions by role</p>
                  <p className="text-sm text-muted-foreground">Choose a role and set View, Create, Edit and Delete access per module. Saved permissions apply immediately for that role.</p>
                </div>
                <SimpleSelect value={permRole} onChange={(v) => setPermRole(v as Role)} className="sm:w-44" options={ROLES} />
              </div>

              {permRole === "Owner" && (
                <p className="rounded-md border border-info/20 bg-info/10 px-3 py-2 text-sm text-info">
                  Owner has full access to every module. Permissions for this role cannot be changed.
                </p>
              )}

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-36">Module</TableHead>
                      {PERM_ACTIONS.map((a) => (
                        <TableHead key={a} className="w-24 text-center">{a}</TableHead>
                      ))}
                      <TableHead className="w-24 text-center">All</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PERM_MODULES.map((module) => {
                      const row = perms[permRole][module];
                      const allChecked = PERM_ACTIONS.every((a) => row[a]);
                      return (
                        <TableRow key={module}>
                          <TableCell className="font-medium">{module}</TableCell>
                          {PERM_ACTIONS.map((action) => (
                            <TableCell key={action} className="text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={row[action]}
                                  disabled={permRole === "Owner"}
                                  onCheckedChange={() => togglePerm(module, action)}
                                  aria-label={`${module} ${action}`}
                                />
                              </div>
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={allChecked}
                                disabled={permRole === "Owner"}
                                onCheckedChange={(c) => toggleRow(module, c === true)}
                                aria-label={`${module} all`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={permRole === "Owner"}
                  onClick={() => {
                    actions.saveRolePermissions(perms);
                    toast.success(`Permissions saved for ${permRole}.`);
                  }}
                >
                  Save Permissions
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "add" ? "Add User" : "Edit User"}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.name} className="sm:col-span-2">
                <Input autoFocus value={dialog.data.name} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })} />
              </Field>
              <Field label="Email" error={errors.email}>
                <Input type="email" value={dialog.data.email} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, email: e.target.value } })} />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <Input value={dialog.data.phone} onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, phone: e.target.value } })} />
              </Field>
              <Field label="Role" error={errors.role}>
                <SimpleSelect value={dialog.data.role} onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, role: v as Role } })} options={ROLES} />
              </Field>
              <Field label="Status">
                <SimpleSelect
                  value={dialog.data.status}
                  onChange={(v) => setDialog({ ...dialog, data: { ...dialog.data, status: v as "Active" | "Inactive" } })}
                  options={["Active", "Inactive"]}
                />
              </Field>
              <Field
                label={dialog.mode === "add" ? "Password" : "New password (optional)"}
                error={errors.password}
                className="sm:col-span-2"
              >
                <Input
                  type="password"
                  placeholder={dialog.mode === "add" ? "Min. 6 characters" : "Leave blank to keep current"}
                  value={dialog.data.password}
                  onChange={(e) => setDialog({ ...dialog, data: { ...dialog.data, password: e.target.value } })}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete user?"
        description={`This will permanently remove ${del?.name}. They will no longer be able to sign in.`}
        onConfirm={() => {
          if (del) {
            actions.deleteUser(del.id);
            toast.success("User deleted.");
          }
          setDel(null);
        }}
      />
    </div>
  );
}
