import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/_app/notifications")({
  head: pageHead("Notifications", "Notifications in shoponclick."),
  component: () => (
    <div>
      <PageHeader title="Notifications" />
      <Card><EmptyState title="Notifications is being built next." description="This page will be ready in the next update." /></Card>
    </div>
  ),
});
