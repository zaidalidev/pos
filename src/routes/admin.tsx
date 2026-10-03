import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { getSessionUser, isPlatformAdmin } from "@/lib/store";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: () => {
    const user = getSessionUser();
    if (!user || user.status !== "Active" || !isPlatformAdmin(user)) {
      throw redirect({ to: "/login" });
    }
  },
  component: AdminLayout,
});
