import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared";
import { pageHead } from "@/lib/format";

export const Route = createFileRoute("/onboarding")({
  head: pageHead("Onboarding", "Set up your shop in Dukan on Click."),
  component: () => (
    <div>
      <PageHeader title="onboarding" />
      <Card><EmptyState title="onboarding is being built next." description="This page will be ready in the next update." /></Card>
    </div>
  ),
});
