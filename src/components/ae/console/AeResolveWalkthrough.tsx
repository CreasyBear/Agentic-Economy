import { ArrowRightIcon, CheckIcon, SearchIcon, WalletIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Static spec-sheet walkthrough of the one-connection resolve loop: a task
 * enters, the market ranks live candidates on price and evidence, and the
 * chosen Operation settles from the same wallet. This is an honest illustration
 * of the product flow, not a fake live stream — the numbers are fixed.
 */
export function AeResolveWalkthrough({ className }: Readonly<{ className?: string }>) {
  const candidates = [
    { name: "exa.search", price: "$0.004", evidence: "94", order: "first" },
    { name: "parallel.search", price: "$0.004", evidence: "88", order: "second" },
    { name: "tavily.search", price: "$0.004", evidence: "90", order: "third" },
  ] as const;

  return (
    <section aria-labelledby="resolve-walkthrough-title" className={cn("grid gap-5", className)}>
      <div className="grid gap-1">
        <h2 id="resolve-walkthrough-title" className="text-xl font-semibold text-foreground">
          Resolve at runtime, one payment lane
        </h2>
        <p className="block max-w-3xl text-sm text-muted-foreground">
          The agent asks for a job. The market ranks the live candidates and pays the winner from a
          single wallet — no per-provider accounts, no invoices to chase.
        </p>
      </div>

      <Card className="p-5">
        <CardHeader className="p-0">
          <CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Agent · auto</Badge>
              <span className="text-sm font-medium text-muted-foreground">Find current capabilities for “web search”</span>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="grid gap-6 p-0">
          <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
            <WalkthroughStage
              icon={<SearchIcon aria-hidden="true" />}
              number="01"
              title="Search the market"
              body="The agent resolves the job against current Operations, not a hand-curated list."
            />
            <WalkthroughStage
              icon={<ArrowRightIcon aria-hidden="true" />}
              number="02"
              title="Rank on price and evidence"
              body="Live candidates scored on total authorization, readiness, and measured evidence."
            />
            <WalkthroughStage
              icon={<WalletIcon aria-hidden="true" />}
              number="03"
              title="Pay per use"
              body="The chosen Operation settles from the same balance. One receipt, one ledger."
            />
          </ol>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start">
            <div className="grid gap-2 rounded-lg border p-3">
              {candidates.map((candidate) => (
                <div
                  key={candidate.name}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                    candidate.name === "exa.search" ? "bg-muted/40" : "border-border",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {candidate.name === "exa.search" ? (
                      <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
                    ) : null}
                    <span className="truncate font-mono text-xs text-foreground">{candidate.name}</span>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {candidate.price}
                    <span aria-hidden="true">·</span>
                    quality {candidate.evidence}
                    <span aria-hidden="true">·</span>
                    {candidate.order}
                  </span>
                </div>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">
                ✓ <span className="font-medium text-foreground">exa.search selected</span> — no signup for this provider
              </p>
            </div>

            <div className="grid gap-2 rounded-lg border p-4">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Wallet balance</p>
              <div className="grid gap-2 font-mono text-sm tabular-nums">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="line-through">$0.0462</span>
                  <span>before</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-foreground">
                  <span className="text-lg font-semibold">$0.0458</span>
                  <span className="text-success">−$0.0004</span>
                </div>
              </div>
              <Separator />
              <p className="text-xs leading-5 text-muted-foreground">
                exa.search invoked, $0.004 charged to the same wallet. No invoice, no per-provider billing.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function WalkthroughStage({
  icon,
  number,
  title,
  body,
}: Readonly<{
  icon: ReactNode;
  number: string;
  title: string;
  body: string;
}>) {
  return (
    <li className="grid content-start gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-mono text-xs">{number}</span>
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </li>
  );
}