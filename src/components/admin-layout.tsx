import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { HandCoins, LayoutDashboard, LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { actions, usePlatform, useSessionUser } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AppLogo } from "@/components/app-logo";
import { APP_NAME } from "@/lib/branding";

const NAV = [
  { label: "Overview", to: "/admin" as const, icon: LayoutDashboard, match: "exact" as const },
  { label: "Shops", to: "/admin/shops" as const, icon: Store, match: "prefix" as const },
  { label: "Fees", to: "/admin/fees" as const, icon: HandCoins, match: "prefix" as const },
];

export function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const session = useSessionUser();
  const platform = usePlatform();

  const logout = async () => {
    await actions.logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <AppLogo className="h-8 w-auto max-w-[120px]" tone="dark" />
            <div className="leading-tight">
              <p className="text-sm font-bold">{APP_NAME} Admin</p>
              <p className="text-xs text-muted-foreground">Platform console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session?.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => {
            const active = item.match === "exact"
              ? pathname === item.to || pathname === `${item.to}/`
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {platform.viewingShopId && (
        <div className="border-b bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          You are viewing a shop as admin.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              actions.exitShop();
              navigate({ to: "/admin/shops" });
            }}
          >
            Return to admin
          </button>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
