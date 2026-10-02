import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell, BarChart3, Boxes, LayoutDashboard, Landmark, LogOut, Package, Receipt, RotateCcw, Search, Settings, ShoppingBag, ShoppingCart, Tags, Truck, UserCircle, Users, UsersRound, Wallet, CreditCard, IdCard,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { FileRoutesByTo } from "@/routeTree.gen";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { actions, useDB, useSessionUser } from "@/lib/store";
import { can, type PermModule } from "@/lib/permissions";
import { rs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AppLogo } from "@/components/app-logo";
import { APP_NAME } from "@/lib/branding";
import { useShopFavicon } from "@/lib/use-shop-favicon";

type To = keyof FileRoutesByTo;
type NavItem = { label: string; icon: React.ComponentType<{ className?: string }>; to: To; module: PermModule | null };

const SEARCH_LIMIT = 10;

const REPORT_NAV: { label: string; to: To }[] = [
  { label: "Sales Report", to: "/reports/sales" },
  { label: "Purchase Report", to: "/reports/purchases" },
  { label: "Profit & Loss", to: "/reports/profit-loss" },
  { label: "Inventory Reports", to: "/reports/inventory" },
  { label: "Customer Report", to: "/reports/customers" },
  { label: "Supplier Report", to: "/reports/suppliers" },
  { label: "Expense Report", to: "/reports/expenses" },
];

export const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", module: null },
  { label: "POS", icon: CreditCard, to: "/pos", module: "Sales" },
  { label: "Sales", icon: ShoppingCart, to: "/sales", module: "Sales" },
  { label: "Sale Returns", icon: RotateCcw, to: "/sale-returns", module: "Sales" },
  { label: "Purchases", icon: ShoppingBag, to: "/purchases", module: "Purchases" },
  { label: "Purchase Returns", icon: RotateCcw, to: "/purchase-returns", module: "Purchases" },
  { label: "Products", icon: Package, to: "/products", module: "Products" },
  { label: "Categories", icon: Tags, to: "/categories", module: "Products" },
  { label: "Stock", icon: Boxes, to: "/inventory", module: "Inventory" },
  { label: "Customers", icon: Users, to: "/customers", module: "Customers" },
  { label: "Suppliers", icon: Truck, to: "/suppliers", module: "Suppliers" },
  { label: "Staff", icon: IdCard, to: "/staff", module: "Settings" },
  { label: "Accounts", icon: Landmark, to: "/accounts", module: "Settings" },
  { label: "Expenses", icon: Wallet, to: "/expenses", module: "Expenses" },
  { label: "Reports", icon: BarChart3, to: "/reports", module: "Reports" },
  { label: "Users & Roles", icon: UsersRound, to: "/users", module: "Settings" },
];

function matchPath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}
function crumbs(pathname: string): { label: string; to?: To }[] {
  if (pathname === "/notifications") return [{ label: "Notifications" }];
  if (pathname === "/settings/notifications") return [{ label: "Notification Settings" }];
  if (pathname === "/settings/shop") return [{ label: "Shop Settings" }];
  if (pathname.startsWith("/inventory/adjustments")) return [{ label: "Stock Adjustments" }];
  if (pathname === "/profile") return [{ label: "Profile" }];
  if (pathname.startsWith("/reports/inventory/")) {
    const slug = pathname.replace(/^\/reports\/inventory\//, "").replace(/\/$/, "");
    const labels: Record<string, string> = {
      "current-stock": "Current Stock",
      "low-stock": "Low Stock",
      "out-of-stock": "Out of Stock",
      "stock-valuation": "Stock Valuation",
      "stock-movement": "Stock Movement",
      "stock-adjustment-history": "Stock Adjustment History",
      "fast-moving": "Fast-Moving Products",
      "slow-moving": "Slow-Moving Products",
      "dead-stock": "Dead Stock",
      "product-wise-stock": "Product-wise Stock",
    };
    return labels[slug]
      ? [{ label: "Inventory Reports", to: "/reports/inventory" }, { label: labels[slug] }]
      : [{ label: "Inventory Reports" }];
  }
  let best: { label: string; to: To } | null = null;
  for (const n of [...NAV, ...REPORT_NAV]) {
    if (matchPath(pathname, n.to) && (!best || n.to.length > best.to.length)) best = { label: n.label, to: n.to };
  }
  if (!best) return [{ label: "Home" }];
  if (pathname !== best.to && pathname !== `${best.to}/`) {
    const tail = pathname.endsWith("/edit") ? "Edit" : pathname.endsWith("/new") ? "New" : "Details";
    return [{ label: best.label, to: best.to }, { label: tail }];
  }
  return [{ label: best.label }];
}

function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const { settings, rolePermissions } = useDB();
  const session = useSessionUser();
  const close = () => setOpenMobile(false);
  const visibleNav = NAV.filter((n) => !n.module || (session && (session.isPlatformAdmin || can(rolePermissions, session.role, n.module, "View"))));
  const isActive = (to: string) => {
    const best = visibleNav.map((n) => n.to as string).filter((t) => matchPath(pathname, t)).sort((a, b) => b.length - a.length)[0];
    return best === to;
  };
  return (
    <Sidebar collapsible="icon" expandOnHover>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-2">
        <Link to="/dashboard" onClick={close} className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <AppLogo
            logo={settings.shop.logo}
            className="h-8 w-auto max-w-[132px] shrink-0 bg-transparent group-data-[collapsible=icon]:max-w-8 group-data-[collapsible=icon]:object-cover"
          />
          <div className="leading-tight group-data-[collapsible=icon]:hidden">
            <p className="font-bold text-sidebar-accent-foreground">{APP_NAME}</p>
            <p className="max-w-[150px] truncate text-xs text-sidebar-foreground/70">{settings.shop.name}</p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visibleNav.map((n) => (
              <SidebarMenuItem key={n.to}>
                <SidebarMenuButton asChild isActive={isActive(n.to)} className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground">
                  <Link to={n.to} onClick={close}><n.icon className="size-4" /><span>{n.label}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const db = useDB();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const go = (fn: () => void) => { setOpen(false); setQ(""); fn(); };
  const needle = q.trim().toLowerCase();

  const results = useMemo(() => {
    const match = (hay: string) => !needle || hay.toLowerCase().includes(needle);
    const take = <T,>(items: T[], pred: (item: T) => boolean) => {
      const out: T[] = [];
      for (const item of items) {
        if (!pred(item)) continue;
        out.push(item);
        if (out.length >= SEARCH_LIMIT) break;
      }
      return out;
    };
    return {
      products: take(db.products, (p) => match(`${p.name} ${p.sku} ${p.barcode} ${p.brand}`)),
      customers: take(db.customers, (c) => match(`${c.name} ${c.phone}`)),
      staff: take(db.staff, (s) => match(`${s.name} ${s.phone} ${s.role}`)),
      suppliers: take(db.suppliers, (s) => match(`${s.name} ${s.phone} ${s.city}`)),
      accounts: take(db.accounts, (a) => match(`${a.name} ${a.type} ${a.accountNumber} ${a.phone}`)),
      sales: take(db.sales, (s) => match(s.invoiceNo)),
      purchases: take(db.purchases, (p) => match(p.no)),
    };
  }, [db.products, db.customers, db.staff, db.suppliers, db.accounts, db.sales, db.purchases, needle]);

  const empty =
    !results.products.length &&
    !results.customers.length &&
    !results.staff.length &&
    !results.suppliers.length &&
    !results.accounts.length &&
    !results.sales.length &&
    !results.purchases.length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
      shouldFilter={false}
    >
      <CommandInput value={q} onValueChange={setQ} placeholder="Search products, customers, invoices..." />
      <CommandList>
        {empty && <CommandEmpty>No results found.</CommandEmpty>}
        {results.products.length > 0 && (
          <CommandGroup heading="Products">
            {results.products.map((p) => (
              <CommandItem key={p.id} value={`product ${p.id}`} onSelect={() => go(() => navigate({ to: "/products/$id", params: { id: p.id } }))}>
                <span className="flex-1 truncate">{p.name}</span><span className="text-xs text-muted-foreground">{p.sku} · {p.stock} in stock</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.customers.length > 0 && (
          <CommandGroup heading="Customers">
            {results.customers.map((c) => (
              <CommandItem key={c.id} value={`customer ${c.id}`} onSelect={() => go(() => navigate({ to: "/customers/$id", params: { id: c.id } }))}>
                <span className="flex-1">{c.name}</span><span className="text-xs text-muted-foreground">{c.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.staff.length > 0 && (
          <CommandGroup heading="Staff">
            {results.staff.map((s) => (
              <CommandItem key={s.id} value={`staff ${s.id}`} onSelect={() => go(() => navigate({ to: "/staff/$id", params: { id: s.id } }))}>
                <span className="flex-1">{s.name}</span><span className="text-xs text-muted-foreground">{s.role} · {s.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.suppliers.length > 0 && (
          <CommandGroup heading="Suppliers">
            {results.suppliers.map((c) => (
              <CommandItem key={c.id} value={`supplier ${c.id}`} onSelect={() => go(() => navigate({ to: "/suppliers/$id", params: { id: c.id } }))}>
                <span className="flex-1">{c.name}</span><span className="text-xs text-muted-foreground">{c.city}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.accounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {results.accounts.map((a) => (
              <CommandItem key={a.id} value={`account ${a.id}`} onSelect={() => go(() => navigate({ to: "/accounts/$id", params: { id: a.id } }))}>
                <span className="flex-1">{a.name}</span><span className="text-xs text-muted-foreground">{a.type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.sales.length > 0 && (
          <CommandGroup heading="Invoices">
            {results.sales.map((s) => (
              <CommandItem key={s.id} value={`invoice ${s.id}`} onSelect={() => go(() => navigate({ to: "/sales/$id", params: { id: s.id } }))}>
                <span className="flex-1">{s.invoiceNo}</span><span className="text-xs text-muted-foreground">{rs(s.total)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.purchases.length > 0 && (
          <CommandGroup heading="Purchases">
            {results.purchases.map((p) => (
              <CommandItem key={p.id} value={`purchase ${p.id}`} onSelect={() => go(() => navigate({ to: "/purchases" }))}>
                <span className="flex-1">{p.no}</span><span className="text-xs text-muted-foreground">{rs(p.total)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function Notifications() {
  const { notifications } = useDB();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          <button className="cursor-pointer text-xs font-medium text-primary" onClick={() => actions.markRead()}>Mark all as read</button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.slice(0, 6).map((n) => (
            <button key={n.id} onClick={() => actions.markRead(n.id)} className={cn("flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-muted/60", !n.read && "bg-accent/40")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{n.title}</span>
                <span className="block text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.time), { addSuffix: true })}</span>
              </span>
            </button>
          ))}
        </div>
        <Link to="/notifications" className="block px-4 py-2.5 text-center text-sm font-medium text-primary">View all notifications</Link>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const { currentUser, settings, rolePermissions, viewingShopId, shops } = useDB();
  const session = useSessionUser();
  const canSettings = session
    ? session.isPlatformAdmin || can(rolePermissions, session.role, "Settings", "View")
    : false;
  const viewingShop = viewingShopId ? shops.find((s) => s.id === viewingShopId) : null;
  useShopFavicon(settings.shop.logo);
  useEffect(() => {
    document.documentElement.setAttribute("data-brand", settings.branding.theme);
  }, [settings.branding.theme]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const c = crumbs(pathname);
  const logout = () => {
    actions.logout();
    navigate({ to: "/login" });
  };
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        {session?.isPlatformAdmin && viewingShop && (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            <span>
              Viewing <strong>{viewingShop.name}</strong> as platform admin.
            </span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                actions.exitShop();
                navigate({ to: "/admin/shops" });
              }}
            >
              Back to admin
            </button>
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="md:hidden" />
          <Breadcrumb className="hidden md:block">
            <BreadcrumbList>
              {c.map((x, i) => (
                <span key={x.label} className="contents">
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {x.to ? (
                      <BreadcrumbLink asChild className="cursor-pointer">
                        <Link to={x.to}>{x.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{x.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 cursor-text rounded-md border bg-background px-3 text-sm text-muted-foreground hover:bg-muted sm:w-64">
              <Search className="size-4" /><span className="hidden sm:inline">Search anything...</span>
              <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
            </button>
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full" aria-label="Account menu">
                  <Avatar className="size-8"><AvatarFallback className="cursor-pointer bg-primary text-xs font-semibold text-primary-foreground">{currentUser.split(" ").map((w) => w[0]).join("")}</AvatarFallback></Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 cursor-pointer">
                <DropdownMenuLabel>
                  <p className="font-semibold">{currentUser}</p>
                  <p className="text-xs font-normal text-muted-foreground">{session?.role ?? "Guest"}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate({ to: "/profile" })}><UserCircle className="size-4" />My Profile</DropdownMenuItem>
                {canSettings && (
                  <>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate({ to: "/settings/shop" })}><Settings className="size-4" />Shop Settings</DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate({ to: "/settings/notifications" })}><Bell className="size-4" />Notifications</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={logout}><LogOut className="size-4" />Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full flex-1 px-4 mt-4">
          {(pathname === "/reports" || pathname.startsWith("/reports/")) && (
            <div className="mb-3 mt-4 flex flex-wrap gap-2">
              {REPORT_NAV.map((r) => {
                const active = r.to === "/reports/inventory"
                  ? pathname === "/reports/inventory" || pathname.startsWith("/reports/inventory/")
                  : pathname === r.to;
                return (
                  <Button key={r.to} asChild size="sm" variant={active ? "default" : "outline"}>
                    <Link to={r.to}>{r.label}</Link>
                  </Button>
                );
              })}
            </div>
          )}
          <Outlet />
        </main>
      </SidebarInset>
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </SidebarProvider>
  );
}
