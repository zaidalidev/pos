import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Package, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/shared";
import { AppLogo } from "@/components/app-logo";
import { APP_NAME } from "@/lib/branding";
import { publicPageHead } from "@/lib/seo";
import { actions, getSessionUser, sessionHome } from "@/lib/store";
import { isNeonConfigured } from "@/lib/neon";

export const Route = createFileRoute("/login")({
  head: publicPageHead(
    "Sign in",
    `Sign in to your ${APP_NAME} account. POS, inventory, sales and accounts for accessories shops in Pakistan.`,
    "/login",
  ),
  beforeLoad: () => {
    const user = getSessionUser();
    if (user && user.status === "Active") {
      throw redirect({ to: sessionHome() as "/dashboard" });
    }
  },
  component: Login,
});

const FEATURES = [
  { icon: Zap, text: "Lightning-fast POS built for busy counters" },
  { icon: Package, text: "Real-time inventory across every category" },
  { icon: ShieldCheck, text: "Secure, role-based access for your whole team" },
];

function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      <div className="flex items-center">
        <AppLogo className="h-12 w-auto max-w-[220px] bg-transparent" />
      </div>
      <div className="space-y-6">
        <h2 className="text-3xl font-bold leading-tight">Run you shop, effortlessly.</h2>
        <p className="text-sm text-primary-foreground/80">POS, inventory, customers and reports — all in one place, built for Pakistani retail.</p>
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

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 6) next.password = "Password must be at least 6 characters.";
    if (!isNeonConfigured()) {
      next.form = "Neon Auth is not configured. Add VITE_NEON_AUTH_URL to .env.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const result = await actions.login(email, password, remember);
      if (!result.ok) {
        setErrors({ form: result.error });
        toast.error(result.error);
        return;
      }
      toast.success(`Welcome back, ${result.user.name.split(" ")[0]}.`);
      navigate({ to: sessionHome() as "/dashboard" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-sm border-none p-6 shadow-none sm:border sm:shadow-sm">
          <div className="mb-6 space-y-1 text-center">
            <AppLogo className="mx-auto mb-3 h-14 w-auto max-w-[240px] lg:hidden" tone="dark" />
            <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to your {APP_NAME} account.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" error={errors.email}>
              <Input type="email" placeholder="you@shop.pk" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={busy} />
            </Field>
            <Field label="Password" error={errors.password}>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" disabled={busy} />
                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} disabled={busy} />
                Remember me
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
