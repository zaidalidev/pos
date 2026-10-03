import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionUser, sessionHome } from "@/lib/store";
import { APP_NAME } from "@/lib/branding";
import { publicPageHead, SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: publicPageHead(
    `${APP_NAME} — ${SITE_TAGLINE}`,
    SITE_DESCRIPTION,
    "/",
  ),
  beforeLoad: () => {
    const user = getSessionUser();
    if (user && user.status === "Active") {
      throw redirect({ to: sessionHome() as "/dashboard" });
    }
    throw redirect({ to: "/login" });
  },
});
