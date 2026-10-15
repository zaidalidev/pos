import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, CreditCard, HandCoins, Receipt, TrendingUp, Truck, UserPlus, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker, PageHeader, StatCard, StatusBadge, ProductThumb, EmptyState } from "@/components/shared";
import { due, saleDue, saleProfit, stockStatus, useDB } from "@/lib/store";
import { expiryBadge, expiryPhrase, expiryStatus, productsAtRisk, productVariantLabel } from "@/lib/product-attrs";
import { takeRecent } from "@/lib/query";
import { fmtDate, fmtTime, inRange, pageHead, rs, toDateInput, type Range } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({
  head: pageHead("Dashboard", "Sales, profit, stock and dues at a glance."),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

function todayRange(): Range {
  const t = toDateInput(new Date());
  return { from: t, to: t };
}

function rangeLabel(range: Range) {
  if (!range.from && !range.to) return "All time";
  if (range.from && range.to && range.from === range.to) {
    const t = toDateInput(new Date());
    return range.from === t ? "Today" : fmtDate(range.from);
  }
  if (range.from && range.to) return `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  if (range.from) return `From ${fmtDate(range.from)}`;
  return `Until ${fmtDate(range.to)}`;
}

function daysInRange(range: Range) {
  const to = range.to ? new Date(range.to) : new Date();
  const from = range.from ? new Date(range.from) : (() => {
    const d = new Date(to);
    d.setDate(d.getDate() - 13);
    return d;
  })();
  const days: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  // Cap chart points so all-time ranges stay readable
  const maxDays = 60;
  const span = Math.round((end.getTime() - cur.getTime()) / 86_400_000) + 1;
  if (span > maxDays) {
    cur.setTime(end.getTime() - (maxDays - 1) * 86_400_000);
  }
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function Dashboard() {
  const db = useDB();
  const [range, setRange] = useState<Range>(todayRange);
  const period = rangeLabel(range);

  const d = useMemo(() => {
    const productById = new Map(db.products.map((p) => [p.id, p]));
    const categoryById = new Map(db.categories.map((c) => [c.id, c]));
    const sales = db.sales.filter((s) => inRange(s.date, range) && s.status !== "Returned");
    const expenses = db.expenses.filter((e) => inRange(e.date, range));
    const byDay = new Map<string, { sales: number; profit: number }>();
    for (const s of sales) {
      const key = new Date(s.date).toDateString();
      const cur = byDay.get(key) ?? { sales: 0, profit: 0 };
      cur.sales += s.total;
      cur.profit += saleProfit(s);
      byDay.set(key, cur);
    }
    const days = daysInRange(range).map((dt) => {
      const cur = byDay.get(dt.toDateString()) ?? { sales: 0, profit: 0 };
      return { day: dt.toLocaleDateString("en-PK", { day: "2-digit", month: "short" }), sales: cur.sales, profit: cur.profit };
    });
    const byCat: Record<string, number> = {};
    for (const s of sales) {
      for (const i of s.items) {
        const cat = productById.get(i.productId)?.categoryId ?? "";
        const leaf = categoryById.get(cat);
        const name = leaf?.parentId
          ? categoryById.get(leaf.parentId)?.name ?? leaf.name
          : leaf?.name ?? "Other";
        byCat[name] = (byCat[name] ?? 0) + i.qty * i.price;
      }
    }
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 5).map(([name, value]) => ({ name, value }));
    const rest = cats.slice(5).reduce((a, b) => a + b[1], 0);
    if (rest) top.push({ name: "Others", value: rest });
    return {
      sales: sales.reduce((a, b) => a + b.total, 0),
      itemsSold: sales.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty, 0), 0),
      profit: sales.reduce((a, b) => a + saleProfit(b), 0),
      expenses: expenses.reduce((a, b) => a + b.amount, 0),
      lowStock: db.products.filter((p) => p.stock <= p.minStock).length,
      receivable: db.sales.reduce((a, s) => a + saleDue(s, db.saleReturns), 0),
      payable: db.purchases.reduce((a, s) => a + due(s), 0),
      count: sales.length, days, cats: top,
    };
  }, [db, range]);
  const low = db.products.filter((p) => p.stock <= p.minStock).slice(0, 6);
  const atRisk = useMemo(() => productsAtRisk(db.products), [db.products]);
  const expiredCount = atRisk.filter((p) => expiryStatus(p.expiryDate) === "expired").length;
  const soonCount = atRisk.length - expiredCount;
  const cust = (id: string | null) => db.customers.find((c) => c.id === id)?.name ?? "Walk-in customer";

  return (
    <div>
      <PageHeader
        title={`Welcome, ${db.currentUser.split(" ")[0]}`}
        description={`Here's how ${db.settings.shop.name} is doing · ${period}.`}
        actions={
          <>
            <Button asChild size="sm"><Link to="/pos"><CreditCard className="size-4" />New Sale</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/customers"><UserPlus className="size-4" />Add Customer</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/expenses"><Wallet className="size-4" />Add Expense</Link></Button>
            <DateRangePicker value={range} onChange={setRange} />
          </>
        }
      />
      {atRisk.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            {[expiredCount ? `${expiredCount} expired` : "", soonCount ? `${soonCount} expiring within 30 days` : ""].filter(Boolean).join(" · ")}
          </p>
          <Button asChild size="sm" variant="outline"><Link to="/inventory/expiring">View list</Link></Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sales" value={rs(d.sales)} hint={`${d.itemsSold} items sold`} icon={Receipt} />
        <StatCard label="Profit" value={rs(d.profit)} icon={TrendingUp} tone="success" />
        <StatCard label="Expenses" value={rs(d.expenses)} icon={ArrowDownRight} tone="destructive" />
        <StatCard label="Low Stock Items" value={d.lowStock} icon={AlertTriangle} tone="warning" />
        <StatCard label="Customer Receivables" value={rs(d.receivable)} icon={HandCoins} tone="warning" />
        <StatCard label="Supplier Payables" value={rs(d.payable)} icon={Truck} tone="warning" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Sales Overview <span className="text-sm font-normal text-muted-foreground">· {period}</span></CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.days}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `${v / 1000}k`} width={36} />
                <Tooltip formatter={(v: number) => rs(v)} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="sales" name="Sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle className="text-base">Sales by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d.cats} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {d.cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => rs(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {d.cats.map((c, i) => (
                <li key={c.name} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /><span className="flex-1 truncate">{c.name}</span><span className="font-medium">{rs(c.value)}</span></li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="shadow-none lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Profit Overview</CardTitle></CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer>
              <AreaChart data={d.days}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `${v / 1000}k`} width={36} />
                <Tooltip formatter={(v: number) => rs(v)} />
                <Area dataKey="profit" name="Profit" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="gap-0 shadow-none xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Recent Sales</CardTitle><Link to="/sales" className="text-sm font-medium text-primary">View all</Link></CardHeader>
          <CardContent className="px-0">
            <div className="divide-y">
              {takeRecent(db.sales, 7).map((s) => (
                <Link key={s.id} to="/sales/$id" params={{ id: s.id }} className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{s.invoiceNo} · {cust(s.customerId)}</p><p className="text-xs text-muted-foreground">{fmtDate(s.date)} {fmtTime(s.date)} · {s.method}</p></div>
                  <StatusBadge status={s.status} />
                  <p className="w-24 text-right text-sm font-semibold">{rs(s.total)}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {atRisk.length > 0 && (
            <Card className="gap-0 shadow-none">
              <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Expiring Stock</CardTitle><Link to="/inventory/expiring" className="text-sm font-medium text-primary">View all</Link></CardHeader>
              <CardContent className="space-y-2.5">
                {atRisk.slice(0, 6).map((p) => {
                  const badge = expiryBadge(expiryStatus(p.expiryDate));
                  return (
                    <Link key={p.id} to="/products/$id" params={{ id: p.id }} className="flex items-center gap-3">
                      <ProductThumb product={p} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[productVariantLabel(p), expiryPhrase(p.expiryDate)].filter(Boolean).join(" · ")}</span>
                      </span>
                      {badge ? <StatusBadge status={badge} /> : null}
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}
          <Card className="gap-0 shadow-none">
            <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Low Stock Products</CardTitle><Link to="/inventory/low-stock" className="text-sm font-medium text-primary">View all</Link></CardHeader>
            <CardContent className="space-y-2.5">
              {low.length ? low.map((p) => (
                <Link key={p.id} to="/products/$id" params={{ id: p.id }} className="flex items-center gap-3">
                  <ProductThumb product={p} className="size-8" />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <StatusBadge status={stockStatus(p)} />
                  <span className="w-8 text-right text-sm font-semibold">{p.stock}</span>
                </Link>
              )) : <EmptyState title="All stock levels are healthy." />}
            </CardContent>
          </Card>
          <Card className="gap-0 shadow-none">
            <CardHeader className="flex-row items-center justify-between pb-3"><CardTitle className="text-base">Recent Expenses</CardTitle><Link to="/expenses" className="text-sm font-medium text-primary">View all</Link></CardHeader>
            <CardContent className="space-y-2.5">
              {db.expenses.slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm"><span className="min-w-0 truncate"><span className="font-medium">{e.category}</span> · <span className="text-muted-foreground">{e.description}</span></span><span className="font-semibold">{rs(e.amount)}</span></div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
