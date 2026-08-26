import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { AeHomeLanding } from "@/components/ae/home/AeHomeLanding";
import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { Button } from "@/components/ui/button";
import { HOME } from "@/content/brand-copy";
import {
  readHomeCapabilities,
  validateRootSearch,
} from "@/modules/market/home-catalogue";

export { HomeCapabilityResults } from "@/components/ae/home/AeHomeLanding";

export const Route = createFileRoute("/")({
  validateSearch: validateRootSearch,
  beforeLoad: ({ search }) => {
    if (search.q !== undefined) {
      throw redirect({ to: "/t/new", search: { q: search.q } });
    }
  },
  loader: readHomeCapabilities,
  pendingComponent: HomePending,
  errorComponent: HomeError,
  head: () => ({
    meta: [
      { title: HOME.metaTitle },
      { name: "description", content: HOME.metaDescription },
    ],
  }),
  component: ServicesRoute,
});

function ServicesRoute() {
  const read = Route.useLoaderData();

  return (
    <AePublicShell>
      <AeHomeLanding read={read} />
    </AePublicShell>
  );
}

function HomePending() {
  return <AePageSkeleton title="Loading current capabilities" shape="list" />;
}

function HomeError() {
  return (
    <AePageState
      tone="danger"
      title="Unable to load capabilities"
      description="Check your connection and try again. No capability was called."
      action={
        <Button asChild className="min-h-touch">
          <Link to="/">Try again</Link>
        </Button>
      }
    />
  );
}
