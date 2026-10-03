export type Category = { id: string; name: string; description: string; parentId: string | null };
export type Product = {
  id: string; name: string; sku: string; barcode: string; categoryId: string; brand: string;
  purchasePrice: number; salePrice: number; wholesalePrice: number; stock: number; minStock: number;
  supplierId: string; image?: string; description: string; active: boolean;
};
export type Customer = { id: string; name: string; phone: string; email?: string; address: string; city: string; createdAt: string };
export type Supplier = { id: string; name: string; contact: string; phone: string; address: string; city: string; createdAt: string };
export type AccountType = "Cash" | "Card" | "Bank" | "Easypaisa" | "JazzCash" | "Credit";
export const ACCOUNT_TYPES: AccountType[] = ["Cash", "Card", "Bank", "Easypaisa", "JazzCash", "Credit"];
/** @deprecated Use AccountType / accounts — kept for gradual migration */
export type PaymentMethod = AccountType;
export const PAYMENT_METHODS: PaymentMethod[] = ACCOUNT_TYPES;
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  accountNumber: string;
  phone: string;
  openingBalance: number;
  /** True when the original opening balance was later corrected via Edit Opening. */
  openingBalanceEdited?: boolean;
  notes: string;
  active: boolean;
};
/** Audit trail for Add Balance / Edit Opening — shown in the account transaction ledger. */
export type AccountBalanceLog = {
  id: string;
  accountId: string;
  date: string;
  kind: "add" | "edit";
  previous: number;
  next: number;
  by: string;
};
export const accountBalanceLogs: AccountBalanceLog[] = [];
export const DEFAULT_ACCOUNT_ID: Record<AccountType, string> = {
  Cash: "acc-cash",
  Card: "acc-card",
  Bank: "acc-bank",
  Easypaisa: "acc-easypaisa",
  JazzCash: "acc-jazzcash",
  Credit: "acc-credit",
};
export const accounts: Account[] = ACCOUNT_TYPES.map((type) => ({
  id: DEFAULT_ACCOUNT_ID[type],
  name: type,
  type,
  accountNumber: "",
  phone: "",
  openingBalance: 0,
  notes: "",
  active: true,
}));
export function accountIdOf(type: AccountType) {
  return DEFAULT_ACCOUNT_ID[type];
}
export type LineItem = { productId: string; name: string; qty: number; price: number; cost: number };
export type Payment = { id: string; date: string; amount: number; method: string; accountId: string; note?: string };
export type DocStatus = "Paid" | "Partial" | "Unpaid" | "Returned";
export type Sale = {
  id: string; invoiceNo: string; date: string; customerId: string | null; items: LineItem[];
  discount: number; subtotal: number; total: number; paid: number; change: number;
  method: string; accountId: string; status: DocStatus; cashier: string; notes: string; payments: Payment[];
  editedAt?: string;
};
export type Purchase = {
  id: string; no: string; date: string; supplierId: string; items: LineItem[]; discount: number;
  subtotal: number; total: number; paid: number; status: DocStatus; notes: string; payments: Payment[];
  editedAt?: string;
};
export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary", "Transport", "Maintenance", "Internet", "Marketing", "Other"] as const;
export const CITIES = [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta",
  "Sialkot", "Gujranwala", "Hyderabad", "Sukkur", "Bahawalpur", "Sargodha", "Abbottabad", "Mardan",
  "Gujrat", "Sahiwal", "Okara", "Sheikhupura", "Rahim Yar Khan", "Jhang", "Dera Ghazi Khan", "Other",
] as const;
export type Expense = { id: string; date: string; category: string; description: string; amount: number; method: string; accountId: string; addedBy: string };
export type Role = "Owner" | "Manager" | "Cashier" | "Staff";
export type ShopStatus = "Active" | "Suspended";
export type ShopPlan = "Starter" | "Business" | "Professional";
export type Shop = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  status: ShopStatus;
  plan: ShopPlan;
  /** Custom monthly platform fee (PKR). Falls back to plan list price when unset. */
  monthlyFee?: number;
  createdAt: string;
};
/** Platform monthly fee for one shop in one billing month (YYYY-MM). */
export type PlatformFeeStatus = "Paid" | "Pending";
export type PlatformFee = {
  id: string;
  shopId: string;
  /** Billing month as YYYY-MM */
  month: string;
  amount: number;
  status: PlatformFeeStatus;
  paidAt?: string;
  note?: string;
};
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: "Active" | "Inactive";
  /** Local placeholder only — real credentials live in Neon Auth. */
  password: string;
  lastLogin: string;
  /** Shop this user belongs to. null for platform Super Admin. */
  shopId: string | null;
  /** Developer / platform admin — can see all tenants. */
  isPlatformAdmin?: boolean;
  /** Neon Auth user id when linked. */
  authId?: string;
};
export const STAFF_ROLES = ["Manager", "Cashier", "Salesman", "Helper", "Delivery", "Other"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const SALARY_TYPES = ["Monthly", "Daily", "Custom"] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];
export type Staff = {
  id: string; name: string; phone: string; role: StaffRole; salary: number; salaryType: SalaryType; salaryCustom: string;
  joinDate: string; status: "Active" | "Inactive"; address: string; notes: string;
};

export function salaryFieldLabel(type: SalaryType = "Monthly") {
  if (type === "Daily") return "Daily wage";
  if (type === "Custom") return "Salary details";
  return "Monthly salary";
}

export function salaryDueAmount(member: Pick<Staff, "salary" | "salaryType">, monthKey: string) {
  const type = member.salaryType ?? "Monthly";
  if (type === "Custom") return 0;
  if (type === "Daily") {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return member.salary;
    return member.salary * new Date(y, m, 0).getDate();
  }
  return member.salary;
}
export type StaffTxnKind = "Payment" | "Advance" | "AdvanceCut";
export type StaffTxn = {
  id: string; staffId: string; date: string; kind: StaffTxnKind;
  amount: number; method: string; accountId: string; note: string; forMonth: string;
};
export type AdjustType = "Add" | "Remove" | "Damage" | "Lost" | "Correction";
export type Adjustment = { id: string; date: string; productId: string; type: AdjustType; qty: number; before: number; after: number; reason: string; notes: string; by: string };
export type SaleReturn = { id: string; no: string; date: string; saleId: string; invoiceNo: string; items: LineItem[]; reason: string; refund: number; method: string; accountId: string };
export type PurchaseReturn = {
  id: string; no: string; date: string; purchaseId: string; purchaseNo: string; supplierId: string;
  items: LineItem[]; reason: string; amount: number; mode: "Paid" | "Unpaid";
  /** Cash/bank credited when supplier refunds (Paid mode). 0 for Unpaid / never-paid purchases. */
  refund?: number;
  accountId?: string;
  method?: string;
};
export type AppNotification = { id: string; title: string; description: string; time: string; read: boolean; kind: "stock" | "payment" | "sales" | "system" };
export type HeldSale = { id: string; date: string; customerId: string | null; items: { productId: string; qty: number }[]; discount: number };
export type BrandTheme = "emerald" | "blue" | "rose";
export const BRAND_THEMES: { id: BrandTheme; label: string; swatch: string }[] = [
  { id: "emerald", label: "Emerald", swatch: "#0d9488" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
];
export type Settings = {
  shop: { name: string; phone: string; email: string; address: string; city: string; currency: string; taxNumber: string; logo?: string };
  invoice: { prefix: string; startNumber: number; showLogo: boolean; showPhone: boolean; showAddress: boolean; footer: string; terms: string };
  tax: { enabled: boolean; rate: number };
  printer: { type: "Thermal" | "A4"; paperSize: string; width: "58mm" | "80mm"; autoPrint: boolean; connected: boolean };
  branding: { theme: BrandTheme };
  notifications: Record<"lowStock" | "dailySummary" | "paymentReminder" | "purchaseReminder" | "email" | "sms" | "whatsapp", boolean>;
  plan: "Starter" | "Business" | "Professional";
};

/** Top-level categories only */
export const parentCategories = (list: Category[]) => list.filter((c) => !c.parentId);
/** Subcategories of a parent (or all if no parent given) */
export const subcategoriesOf = (list: Category[], parentId?: string) =>
  list.filter((c) => (parentId ? c.parentId === parentId : !!c.parentId));
/** Display path like "Mobile Covers › Silicone Cases" */
export function categoryLabel(list: Category[], id: string) {
  const cat = list.find((c) => c.id === id);
  if (!cat) return "—";
  if (!cat.parentId) return cat.name;
  const parent = list.find((c) => c.id === cat.parentId);
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}
/** Match product category filter against a parent or leaf id */
export function matchesCategory(list: Category[], productCategoryId: string, filterId: string) {
  if (filterId === "all") return true;
  if (productCategoryId === filterId) return true;
  const productCat = list.find((c) => c.id === productCategoryId);
  return productCat?.parentId === filterId;
}

export function statusOf(total: number, paid: number): DocStatus {
  if (paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Unpaid";
}

// Clean slate — no demo seed data. Accounts + one Owner remain for the app to boot.
export const categories: Category[] = [];
export const suppliers: Supplier[] = [];
export const products: Product[] = [];
export const customers: Customer[] = [];
export const staff: Staff[] = [];
export const staffTxns: StaffTxn[] = [];
export const sales: Sale[] = [];
export const purchases: Purchase[] = [];
export const expenses: Expense[] = [];
export const adjustments: Adjustment[] = [];
export const saleReturns: SaleReturn[] = [];
export const purchaseReturns: PurchaseReturn[] = [];
export const notifications: AppNotification[] = [];

/** Legacy id — stripped on hydrate so old localStorage demo shops disappear. */
export const DEMO_SHOP_ID = "shop-demo";

/** Emails that always get app `/admin` access (local `isPlatformAdmin`). */
export const PLATFORM_ADMIN_EMAILS = [
  "zaidalidev0@gmail.com",
] as const;

export function isPlatformAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return PLATFORM_ADMIN_EMAILS.some((e) => e === normalized);
}

/** No seeded shops — admin / fees start empty until real shops are created. */
export const shops: Shop[] = [];

export const users: User[] = [
  {
    id: "u-admin",
    name: "Platform Admin",
    email: "zaidalidev0@gmail.com",
    phone: "03000000000",
    role: "Owner",
    status: "Active",
    password: "",
    lastLogin: "",
    shopId: null,
    isPlatformAdmin: true,
  },
];

export const settings: Settings = {
  shop: { name: "My Shop", phone: "", email: "", address: "", city: "", currency: "PKR", taxNumber: "" },
  invoice: { prefix: "INV", startNumber: 1001, showLogo: true, showPhone: true, showAddress: true, footer: "Thank you for shopping with us!", terms: "" },
  tax: { enabled: false, rate: 0 },
  printer: { type: "Thermal", paperSize: "80mm Roll", width: "80mm", autoPrint: false, connected: false },
  branding: { theme: "emerald" },
  notifications: { lowStock: true, dailySummary: true, paymentReminder: true, purchaseReminder: false, email: true, sms: false, whatsapp: true },
  plan: "Business",
};

export function defaultSettings(shop: Pick<Shop, "name" | "phone" | "email" | "city" | "plan">): Settings {
  return {
    ...settings,
    shop: {
      name: shop.name,
      phone: shop.phone,
      email: shop.email,
      address: "",
      city: shop.city,
      currency: "PKR",
      taxNumber: "",
    },
    plan: shop.plan,
  };
}

export function cloneDefaultAccounts(): Account[] {
  return ACCOUNT_TYPES.map((type) => ({
    id: DEFAULT_ACCOUNT_ID[type],
    name: type,
    type,
    accountNumber: "",
    phone: "",
    openingBalance: 0,
    notes: "",
    active: true,
  }));
}
