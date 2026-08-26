import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

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
      className={cn(
        density === "compact" ? "grid gap-x-4 gap-y-3" : "grid gap-3",
        className,
      )}
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          className={cn(
            "min-w-0",
            density === "default" &&
              "grid gap-1 sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-4",
          )}
        >
          <dt
            className={cn(
              "text-muted-foreground",
              density === "compact" ? "text-xs" : "text-sm",
            )}
            aria-description={fact.definition}
          >
            {fact.label}
          </dt>
          <dd
            className={cn(
              "min-w-0 font-medium tabular-nums",
              density === "compact" ? "mt-0.5 break-words text-sm" : "text-sm",
              fact.mono && "font-mono",
              fact.muted ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
