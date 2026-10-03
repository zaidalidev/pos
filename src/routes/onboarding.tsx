import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/shared";
import { privatePageHead } from "@/lib/seo";

export const Route = createFileRoute("/onboarding")({
  head: privatePageHead("Onboarding", "Set up your shop in shoponclick."),
  component: () => (
    <div>
      <PageHeader title="onboarding" />
      <Card><EmptyState title="onboarding is being built next." description="This page will be ready in the next update." /></Card>
    </div>
  ),
});
