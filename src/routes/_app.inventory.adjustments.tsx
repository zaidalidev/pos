import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/_app/inventory/adjustments")({
  head: pageHead("Stock Adjustments", "Stock adjustments in shoponclick."),
  component: () => (
    <div>
      <PageHeader title="Stock Adjustments" />
      <Card><EmptyState title="Stock Adjustments is being built next." description="This page will be ready in the next update." /></Card>
    </div>
  ),
});
