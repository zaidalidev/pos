import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionUser, sessionHome } from "@/lib/store";
import { APP_NAME } from "@/lib/branding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Simple POS & Inventory Management for Your Shop` },
      { name: "description", content: "POS, inventory, sales and accounts for accessories shops in Pakistan." },
      { property: "og:title", content: `${APP_NAME} — Simple POS & Inventory Management` },
      { property: "og:description", content: "POS, inventory, sales and accounts for accessories shops in Pakistan." },
    ],
  }),
  beforeLoad: () => {
    const user = getSessionUser();
    if (user && user.status === "Active") {
      throw redirect({ to: sessionHome() as "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
