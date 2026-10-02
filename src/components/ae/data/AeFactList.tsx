import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import './FactsComposition.css'

export type AeFact = Readonly<{
  label: string;
  value: ReactNode;
  definition?: string;
  mono?: boolean;
  muted?: boolean;
}>;

export function AeFactList({
  facts,
  density = "default",
  className,
}: {
  facts: readonly AeFact[];
  density?: "default" | "compact";
  className?: string;
}) {
  return (
    <dl
      className={cn('arc-market arc-facts-list', className)}
      data-density={density}
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="arc-facts-row"
        >
          <dt
            className="arc-facts-term"
            aria-description={fact.definition}
          >
            {fact.label}
          </dt>
          <dd
            className="arc-facts-value"
            data-mono={fact.mono ? '' : undefined}
            data-muted={fact.muted ? '' : undefined}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
