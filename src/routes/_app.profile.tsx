import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LogOut, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Field, PageHeader, StatusBadge } from "@/components/shared";
import { pageHead, fmtDateTime } from "@/lib/format";
import { actions, useSessionUser } from "@/lib/store";

export const Route = createFileRoute("/_app/profile")({
  head: pageHead("Profile", "View and update your account profile and security."),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const user = useSessionUser();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [errors, setErrors] = useState<Partial<Record<"name" | "email" | "phone", string>>>({});

  const [current, setCurrent] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdErrors, setPwdErrors] = useState<Partial<Record<"current" | "pwd" | "confirm", string>>>({});

  if (!user) return null;

  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const onAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(file);
  };

  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  const saveProfile = async () => {
    const errs: Partial<Record<"name" | "email" | "phone", string>> = {};
    if (!name.trim()) errs.name = "Name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address.";
    if (!phone.trim()) errs.phone = "Phone number is required.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSavingProfile(true);
    try {
      const result = await actions.saveUser({
        id: user.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: user.role,
        status: user.status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated successfully.");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    const errs: Partial<Record<"current" | "pwd" | "confirm", string>> = {};
    if (!current) errs.current = "Enter your current password.";
    if (pwd.length < 6) errs.pwd = "Password must be at least 6 characters.";
    if (pwd !== confirm) errs.confirm = "Passwords do not match.";
    setPwdErrors(errs);
    if (Object.keys(errs).length) return;
    setChangingPw(true);
    try {
      const result = await actions.changePassword(user.id, current, pwd);
      if (!result.ok) {
        setPwdErrors({ current: result.error });
        toast.error(result.error);
        return;
      }
      setCurrent(""); setPwd(""); setConfirm("");
      toast.success("Password changed successfully.");
    } finally {
      setChangingPw(false);
    }
  };

  const logout = async () => {
    await actions.logout();
    toast.success("Logged out successfully.");
    navigate({ to: "/login" });
  };

  return (
    <div>
      <PageHeader title="Profile" description="Manage your personal information and security." actions={<Button variant="outline" onClick={logout}><LogOut className="size-4" />Logout</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardContent className="space-y-6 p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3 sm:w-40 sm:shrink-0">
                <Avatar className="size-20">
                  <AvatarImage src={avatar} alt={name} />
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <label className="w-full">
                  <Input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
                  <span className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent">
                    <Upload className="size-4" />Change Picture
                  </span>
                </label>
              </div>
              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <Field label="Full Name" error={errors.name} className="sm:col-span-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-card" />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-card" />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-card" />
                </Field>
              </div>
            </div>

            <div className="border-t pt-5">
              <p className="mb-4 text-sm font-semibold">Change Password</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current Password" error={pwdErrors.current} className="sm:col-span-2">
                  <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="bg-card" />
                </Field>
                <Field label="New Password" error={pwdErrors.pwd}>
                  <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="bg-card" />
                </Field>
                <Field label="Confirm Password" error={pwdErrors.confirm}>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="bg-card" />
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={changePassword} disabled={changingPw || savingProfile}>
                {changingPw ? "Updating…" : "Update Password"}
              </Button>
              <Button onClick={saveProfile} disabled={savingProfile || changingPw}>
                {savingProfile ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="space-y-3 p-5 text-sm">
            <p className="mb-1 text-sm font-semibold">Account Information</p>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Role</span><StatusBadge status={user.role} /></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Last Login</span><span>{user.lastLogin ? fmtDateTime(user.lastLogin) : "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={user.status} /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
