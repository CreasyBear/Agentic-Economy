import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { AeHomeLanding } from "@/components/ae/home/AeHomeLanding";
import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { AePageSkeleton, AePageState } from "@/components/ae/layout/AePageState";
import { Button } from "@/components/ui/button";
import { HOME, HOME_FAQ } from "@/content/brand-copy";
import { readCanonicalBaseUrlServer } from "@/lib/server/canonical-url.functions";
import {
  readHomeCapabilities,
  validateRootSearch,
} from "@/modules/market/home-catalogue";
import {
  buildFaqPageJsonLd,
  buildPublicPageHead,
  buildSiteJsonLd,
} from "@/modules/seo/public";

export { HomeCapabilityResults } from "@/components/ae/home/AeHomeLanding";

export const Route = createFileRoute("/")({
  validateSearch: validateRootSearch,
  beforeLoad: ({ search }) => {
    if (search.q !== undefined) {
      throw redirect({ to: "/t/new", search: { q: search.q } });
    }
  },
  loader: async () => {
    const [read, canonicalBaseUrl] = await Promise.all([
      readHomeCapabilities(),
      readCanonicalBaseUrlServer(),
    ]);
    return { read, canonicalBaseUrl };
  },
  pendingComponent: HomePending,
  errorComponent: HomeError,
  head: ({ loaderData }) =>
    buildPublicPageHead({
      path: "/",
      title: HOME.metaTitle,
      description: HOME.metaDescription,
      canonicalBaseUrl: loaderData?.canonicalBaseUrl,
      jsonLd:
        loaderData === undefined
          ? undefined
          : [
              ...buildSiteJsonLd(loaderData.canonicalBaseUrl),
              buildFaqPageJsonLd(HOME_FAQ),
            ],
    }),
  component: ServicesRoute,
});

function ServicesRoute() {
  const { read } = Route.useLoaderData();

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
