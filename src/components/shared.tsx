import { useEffect, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { AlertTriangle, Cable, CalendarIcon, Check, ChevronsUpDown, ChevronLeft, ChevronRight, Headphones, Inbox, Package, Plug, Plus, Search, ShieldCheck, Smartphone, BatteryCharging, Watch, MonitorSmartphone, Ear } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toDateInput, type Range } from "@/lib/format";
import type { Product } from "@/lib/mock-data";
import { useDB } from "@/lib/store";

export function PageHeader({ title, description, titleAside, actions, back }: { title: string; description?: string; titleAside?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-3 md:mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 w-full flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {back && <div className="shrink-0">{back}</div>}
        <div className="min-w-0 w-full flex-1">
          <div className="flex w-full flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            {titleAside}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "default", compact }: { label: string; value: ReactNode; hint?: ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: "default" | "success" | "warning" | "destructive" | "info"; compact?: boolean }) {
  const tones = { default: "bg-accent text-accent-foreground", success: "bg-success/10 text-success", warning: "bg-warning/15 text-warning", destructive: "bg-destructive/10 text-destructive", info: "bg-info/10 text-info" };
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className={cn("flex flex-col p-3", compact ? "gap-0.5 px-3 py-2" : "gap-1.5")}>
        <div className="flex items-center justify-between gap-3">
          <p className={cn("min-w-0 truncate font-medium text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{label}</p>
          {Icon && (
            <div className={cn("grid shrink-0 place-items-center rounded-lg", compact ? "size-7" : "size-9", tones[tone])}>
              <Icon className={compact ? "size-3.5" : "size-4.5"} />
            </div>
          )}
        </div>
        <p className={cn("truncate font-bold tracking-tight", compact ? "text-sm" : "text-xl")}>{value}</p>
        {hint != null && <p className={cn("truncate text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>{hint}</p>}
      </CardContent>
    </Card>
  );
}

const TONE: Record<string, string> = {
  Paid: "success", "In Stock": "success", Active: "success", Completed: "success", Connected: "success",
  Partial: "warning", "Low Stock": "warning", Pending: "warning",
  Unpaid: "destructive", "Out of Stock": "destructive", Inactive: "muted", Returned: "muted",
  Add: "success", Remove: "warning", Damage: "destructive", Lost: "destructive", Correction: "info",
  Owner: "info", Manager: "info", Cashier: "success", Staff: "muted",
  Payment: "success", Advance: "warning", AdvanceCut: "info",
  Salesman: "info", Helper: "muted", Delivery: "info", Other: "muted",
  Edited: "warning",
  Suspended: "warning",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = TONE[status] ?? "info";
  const cls = { success: "bg-success/10 text-success border-success/20", warning: "bg-warning/15 text-warning border-warning/25", destructive: "bg-destructive/10 text-destructive border-destructive/20", muted: "bg-muted text-muted-foreground border-border", info: "bg-info/10 text-info border-info/20" }[t];
  const label = status === "AdvanceCut" ? "Advance cut" : status;
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", cls, className)}>{label}</span>;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action, error }: { title: string; description?: string; icon?: React.ComponentType<{ className?: string }>; action?: ReactNode; error?: boolean }) {
  const I = error ? AlertTriangle : Icon;
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className={cn("mb-3 grid size-12 place-items-center rounded-full", error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
        <I className="size-5" />
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function useFakeLoading(ms = 350) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

export function SearchInput({ value, onChange, placeholder = "Search...", className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-card pl-9"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        name="list-search"
        type="search"
      />
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function SimpleSelect({ value, onChange, options, placeholder, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | string[]; placeholder?: string; className?: string }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("bg-card", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  emptyText = "No results.",
  className,
  onCreate,
  createLabel = (q) => `Add “${q}”`,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** When set, typing a value that isn’t in the list shows an Add option. */
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const selected = opts.find((o) => o.value === value);
  const display = open ? query : (selected?.label ?? "");
  const q = query.trim();
  const qLower = q.toLowerCase();
  const filteredAll = qLower ? opts.filter((o) => o.label.toLowerCase().includes(qLower)) : opts;
  let filtered = filteredAll.slice(0, 50);
  if (selected && !qLower && !filtered.some((o) => o.value === selected.value)) {
    filtered = [selected, ...filtered.slice(0, 49)];
  }
  const moreOptions = filteredAll.length > 50;
  const exactMatch = opts.some((o) => o.label.toLowerCase() === qLower || o.value.toLowerCase() === qLower);
  const canCreate = !!onCreate && q.length > 0 && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const create = () => {
    if (!onCreate || !q) return;
    onCreate(q);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const openPicker = () => {
    if (!open) {
      setOpen(true);
      setQuery("");
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        value={display}
        placeholder={placeholder}
        className="bg-card pr-9"
        onFocus={openPicker}
        onClick={openPicker}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length === 1) select(filtered[0]!.value);
            else if (canCreate) create();
          }
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            inputRef.current?.blur();
          }
        }}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>{canCreate ? null : emptyText}</CommandEmpty>
              <CommandGroup>
                {filtered.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => select(o.value)}>
                    <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
                {moreOptions && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">Type to narrow · showing {filtered.length} of {filteredAll.length}</p>
                )}
                {canCreate && (
                  <CommandItem value={`create-${q}`} onSelect={create} className="text-primary">
                    <Plus className="size-4" />
                    {createLabel(q)}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string | undefined; hint?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CurrencyInput({ value, onChange, className, ...rest }: { value: number; onChange: (n: number) => void; className?: string; placeholder?: string; id?: string; autoFocus?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rs.</span>
      <Input {...rest} type="number" min={0} inputMode="numeric" value={Number.isFinite(value) && value !== 0 ? value : ""} onChange={(e) => onChange(Number(e.target.value) || 0)} className="bg-card pl-10" />
    </div>
  );
}

function parseDateInput(s: string) {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatRangeLabel(value: Range) {
  if (!value.from && !value.to) return "All time";
  const from = parseDateInput(value.from);
  const to = parseDateInput(value.to);
  if (from && to) {
    if (value.from === value.to) return format(from, "dd MMM yyyy");
    return `${format(from, "dd MMM yyyy")} – ${format(to, "dd MMM yyyy")}`;
  }
  if (from) return `From ${format(from, "dd MMM yyyy")}`;
  if (to) return `Until ${format(to, "dd MMM yyyy")}`;
  return "Pick dates";
}

export function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const selected: DateRange | undefined =
    value.from || value.to
      ? { from: parseDateInput(value.from), to: parseDateInput(value.to) }
      : undefined;

  const applyPreset = (days: number | "month" | "all") => {
    const to = new Date();
    if (days === "all") {
      onChange({ from: "", to: "" });
      setOpen(false);
      return;
    }
    const from = new Date();
    if (days === "month") from.setDate(1);
    else from.setDate(from.getDate() - days);
    onChange({ from: toDateInput(from), to: toDateInput(to) });
    setOpen(false);
  };

  const onSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      onChange({ from: "", to: "" });
      return;
    }
    onChange({
      from: toDateInput(range.from),
      to: range.to ? toDateInput(range.to) : "",
    });
    // Stay open after the start date; close once the end date is chosen
    if (range.to) setOpen(false);
  };

  const presets: { label: string; value: number | "month" | "all" }[] = [
    { label: "Today", value: 0 },
    { label: "Last 7 days", value: 7 },
    { label: "Last 30 days", value: 30 },
    { label: "This month", value: "month" },
    { label: "All time", value: "all" },
  ];
  const defaultMonth = selected?.from ?? selected?.to;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 justify-start gap-2 bg-card px-3 font-normal">
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{formatRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row gap-1 overflow-x-auto border-b p-2 sm:w-36 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {presets.map((p) => (
              <Button key={p.label} variant="ghost" size="sm" className="justify-start font-normal" onClick={() => applyPreset(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          <Calendar mode="range" numberOfMonths={1} resetOnSelect selected={selected} onSelect={onSelect} {...(defaultMonth ? { defaultMonth } : {})} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, confirmText = "Delete", destructive = true }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; onConfirm: () => void; confirmText?: string; destructive?: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>{confirmText}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const CAT_ICON: Record<string, React.ComponentType<{ className?: string }>> = { c1: Smartphone, c2: Plug, c3: Cable, c4: Ear, c5: Headphones, c6: BatteryCharging, c7: ShieldCheck, c8: MonitorSmartphone, c9: Watch, c10: Package };
export function ProductThumb({ product, className }: { product: Pick<Product, "categoryId" | "image" | "name">; className?: string }) {
  const db = useDB();
  const cat = db.categories.find((c) => c.id === product.categoryId);
  const iconId = cat?.parentId ?? product.categoryId;
  const I = CAT_ICON[iconId] ?? Package;
  if (product.image) return <img src={product.image} alt={product.name} className={cn("size-10 rounded-md border object-cover", className)} />;
  return (
    <div className={cn("grid size-10 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground", className)}>
      <I className="size-1/2" />
    </div>
  );
}

export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; className?: string; mobileHidden?: boolean };
export function DataTable<T>({ columns, rows, rowKey, loading, empty, onRowClick, rowClassName, pageSize = 10 }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; loading?: boolean; empty?: ReactNode; onRowClick?: (r: T) => void; rowClassName?: (r: T) => string | undefined; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [rows.length, pageSize]);
  if (loading) return <LoadingSkeleton />;
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  const view = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn("h-10 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.className)}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((r) => (
              <TableRow key={rowKey(r)} className={cn(onRowClick && "cursor-pointer", rowClassName?.(r))} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("whitespace-nowrap py-2.5", c.className)}>{c.cell(r)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {safePage * pageSize + 1}–{Math.min(rows.length, (safePage + 1) * pageSize)} of {rows.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="size-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="icon" className="size-8" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
