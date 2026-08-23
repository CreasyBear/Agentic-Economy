import { createFileRoute } from "@tanstack/react-router";

import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { AeRegistryEntryDetail } from "@/components/ae/market/AeRegistryEntryDetail";
import { AeRegistryEntryPending } from "@/components/ae/market/AeRegistryEntryPending";
import { AeRegistryEntryUnavailable } from "@/components/ae/market/AeRegistryEntryUnavailable";
import { readRegistryEntryServer } from "@/modules/market/market.functions";
import type { RegistryEntryRead } from "@/modules/market/server";

export const Route = createFileRoute("/registry/$documentId")({
  loader: ({ params }) =>
    readRegistryEntryServer({ data: { documentId: params.documentId } }).catch(
      (): RegistryEntryRead => ({ kind: "unavailable" }),
    ),
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData?.kind === "found"
            ? `${loaderData.entry.name} | Agentic Economy`
            : "Registry entry unavailable | Agentic Economy",
      },
      ...(loaderData?.kind === "found"
        ? [{ name: "description", content: seoDescription(loaderData.entry.summary) }]
        : [{ name: "robots", content: "noindex" }]),
    ],
  }),
  pendingComponent: AeRegistryEntryPending,
  component: RegistryEntryRoute,
});

function RegistryEntryRoute() {
  const result = Route.useLoaderData();
  return (
    <AePublicShell>
      {result.kind === "found" ? (
        <AeRegistryEntryDetail entry={result.entry} />
      ) : (
        <AeRegistryEntryUnavailable kind={result.kind} />
      )}
    </AePublicShell>
  );
}

function seoDescription(summary: string): string {
  return summary.length <= 180 ? summary : `${summary.slice(0, 177).trimEnd()}…`;
}
