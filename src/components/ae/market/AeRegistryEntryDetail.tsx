import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { AeCopyCommand } from "@/components/ae/data/AeCopyCommand";
import { AeFactList } from "@/components/ae/data/AeFactList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RegistryCardViewModel } from "@/modules/market/server";

const integerFormatter = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 0,
});

export function AeRegistryEntryDetail({
  entry,
}: {
  entry: RegistryCardViewModel;
}) {
  const accessLabel =
    entry.access === "x402"
      ? "Pay per call"
      : entry.access === "provider_account"
        ? "Connect account"
        : "Check access";
  return (
    <article className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6 md:py-8">
      <nav aria-label="Breadcrumb">
        <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
          <Link to="/market" search={{ window: "30d" }}>← Back to registry</Link>
        </Button>
      </nav>

      <header className="grid gap-4 border-b pb-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Registry entry</Badge>
          <Badge variant={entry.access === "x402" ? "info" : "outline"}>
            {accessLabel}
          </Badge>
          <Badge variant="warning">Metadata only</Badge>
        </div>
        <div className="grid max-w-3xl gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {entry.provider} · {entry.category}
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {entry.name}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">{entry.summary}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>API details</CardTitle>
          </CardHeader>
          <CardContent>
            <AeFactList
              facts={[
                { label: "Provider", value: entry.provider },
                { label: "Category", value: entry.category },
                { label: "Access", value: accessLabel },
                { label: "Price", value: entry.priceLabel ?? "Not reported" },
                { label: "Method", value: entry.method ?? "Not reported" },
                {
                  label: "30-day activity",
                  value:
                    entry.sourceCalls30d === undefined
                      ? "Not reported"
                      : `${entry.sourceCalls30d} calls`,
                },
                {
                  label: "Measured latency",
                  value:
                    entry.sourceMedianLatencyMs === undefined
                      ? "Not reported"
                      : `${integerFormatter.format(entry.sourceMedianLatencyMs)} ms median`,
                },
                {
                  label: "Networks",
                  value:
                    entry.networks.length === 0
                      ? "Not reported"
                      : entry.networks.join(", "),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Use this API</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {entry.access === "x402"
                ? "This endpoint declares pay-per-call access. Inspect its live payment requirements before sending a request."
                : "Connect the provider account named in its documentation before making a request."}
            </p>
            {entry.endpointUrl === undefined ? null : (
              <AeCopyCommand label="endpoint URL" code={entry.endpointUrl} compact />
            )}
            {entry.docsUrl === undefined ? null : (
              <Button asChild variant="outline" className="w-full justify-between">
                <a href={entry.docsUrl} target="_blank" rel="noreferrer">
                  Read provider docs
                  <ExternalLinkIcon aria-hidden="true" />
                </a>
              </Button>
            )}
            <Button asChild variant="ghost" className="w-full justify-between">
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                View provenance record
                <ExternalLinkIcon aria-hidden="true" />
              </a>
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              This registry record is discovery metadata. It is not an admitted or
              routeable Agentic Economy Operation.
            </p>
          </CardContent>
        </Card>
      </div>
    </article>
  );
}
