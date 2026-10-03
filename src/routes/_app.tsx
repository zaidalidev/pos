import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { getSessionUser, getState, isPlatformAdmin, sessionCanAccess, sessionHome } from "@/lib/store";

export const Route = createFileRoute("/_app")({
  ssr: false,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: ({ location }) => {
    const s = getState();
    const user = getSessionUser();
    if (!user || user.status !== "Active") {
      throw redirect({ to: "/login" });
    }
    if (isPlatformAdmin(user) && !s.viewingShopId) {
      throw redirect({ to: "/admin" });
    }
    if (!sessionCanAccess(location.pathname, s)) {
      throw redirect({ to: sessionHome() as "/dashboard" });
    }
  },
  component: AppLayout,
});
