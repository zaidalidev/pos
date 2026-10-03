import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/_app/inventory/low-stock")({
  head: pageHead("Low Stock", "Low stock alerts in shoponclick."),
  component: () => (
    <div>
      <PageHeader title="Low Stock" />
      <Card><EmptyState title="Low Stock is being built next." description="This page will be ready in the next update." /></Card>
    </div>
  ),
});
