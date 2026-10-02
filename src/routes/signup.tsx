import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Headphones, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/shared";
import { pageHead } from "@/lib/format";
import { AppLogo } from "@/components/app-logo";
import { APP_NAME } from "@/lib/branding";
import { actions } from "@/lib/store";

export const Route = createFileRoute("/signup")({
  head: pageHead("Create account", `Create your ${APP_NAME} account.`),
  component: Signup,
});

const FEATURES = [
  { icon: TrendingUp, text: "Track sales, profit and stock in real time" },
  { icon: Users, text: "Manage customers, suppliers and staff roles" },
  { icon: Headphones, text: "Friendly support whenever you need it" },
];

function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      <div className="flex items-center">
        <AppLogo className="h-12 w-auto max-w-[220px] bg-transparent" />
      </div>
      <div className="space-y-6">
        <h2 className="text-3xl font-bold leading-tight">Set up your shop in minutes.</h2>
        <p className="text-sm text-primary-foreground/80">Join hundreds of mobile accessory shops running smoother with {APP_NAME}.</p>
        <ul className="space-y-3">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
                <f.icon className="size-3.5" />
              </div>
              <span className="text-primary-foreground/90">{f.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
    </div>
  );
}

type Errors = Partial<Record<"shopName" | "ownerName" | "email" | "phone" | "password" | "confirm" | "terms" | "form", string>>;

function Signup() {
  const navigate = useNavigate();
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!shopName.trim()) next.shopName = "Shop name is required.";
    if (!ownerName.trim()) next.ownerName = "Owner name is required.";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address.";
    if (!phone.trim()) next.phone = "Phone number is required.";
    if (password.length < 8) next.password = "Password must be at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords do not match.";
    if (!terms) next.terms = "You must accept the terms to continue.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const result = actions.signup({ shopName, ownerName, email, phone, password });
    if (!result.ok) {
      setErrors({ form: result.error, email: result.error });
      toast.error(result.error);
      return;
    }
    toast.success("Account created. Let's set up your shop.");
    navigate({ to: "/onboarding" });
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm border-none p-6 shadow-none sm:border sm:shadow-sm">
          <div className="mb-6 space-y-1 text-center">
            <AppLogo className="mx-auto mb-3 h-14 w-auto max-w-[240px] lg:hidden" tone="dark" />
            <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted-foreground">Start managing your shop today.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Shop name" error={errors.shopName}>
              <Input placeholder="Al-Karam Mobile Accessories" value={shopName} onChange={(e) => setShopName(e.target.value)} />
            </Field>
            <Field label="Owner name" error={errors.ownerName}>
              <Input placeholder="Zaid Ali" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" error={errors.email}>
                <Input type="email" placeholder="you@shop.pk" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <Input placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Toggle password visibility">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password" error={errors.confirm}>
                <Input type={showPw ? "text" : "password"} placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            </div>
            <div>
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
                I agree to the Terms of Service and Privacy Policy.
              </label>
              {errors.terms && <p className="mt-1 text-xs text-destructive">{errors.terms}</p>}
            </div>
            {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
            <Button type="submit" className="w-full">Create account</Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
